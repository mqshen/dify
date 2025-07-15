import html
import json
import logging
import re
import secrets
import time
from collections.abc import Generator, Mapping
from threading import Thread
from typing import Any, Optional, Union

from sqlalchemy import select
from sqlalchemy.orm import Session

from constants.tts_auto_play_timeout import TTS_AUTO_PLAY_TIMEOUT, TTS_AUTO_PLAY_YIELD_CPU_TIME
from core.app.apps.base_app_queue_manager import AppQueueManager, PublishFrom
from core.app.apps.common.workflow_response_converter import WorkflowResponseConverter
from core.app.entities.app_invoke_entities import (
    AdvancedChatAppGenerateEntity,
    InvokeFrom,
)
from core.app.entities.queue_entities import (
    QueueAdvancedChatMessageEndEvent,
    QueueAgentLogEvent,
    QueueAnnotationReplyEvent,
    QueueErrorEvent,
    QueueIterationCompletedEvent,
    QueueIterationNextEvent,
    QueueIterationStartEvent,
    QueueLoopCompletedEvent,
    QueueLoopNextEvent,
    QueueLoopStartEvent,
    QueueMessageReplaceEvent,
    QueueNodeExceptionEvent,
    QueueNodeFailedEvent,
    QueueNodeInIterationFailedEvent,
    QueueNodeInLoopFailedEvent,
    QueueNodeRetryEvent,
    QueueNodeStartedEvent,
    QueueNodeSucceededEvent,
    QueueParallelBranchRunFailedEvent,
    QueueParallelBranchRunStartedEvent,
    QueueParallelBranchRunSucceededEvent,
    QueuePingEvent,
    QueueRetrieverResourcesEvent,
    QueueStopEvent,
    QueueTextChunkEvent,
    QueueWorkflowFailedEvent,
    QueueWorkflowPartialSuccessEvent,
    QueueWorkflowStartedEvent,
    QueueWorkflowSucceededEvent,
)
from core.app.entities.task_entities import (
    ChatbotAppBlockingResponse,
    ChatbotAppStreamResponse,
    ErrorStreamResponse,
    MessageAudioEndStreamResponse,
    MessageAudioStreamResponse,
    MessageEndStreamResponse,
    StreamResponse,
    WorkflowTaskState,
)
from core.app.task_pipeline.based_generate_task_pipeline import BasedGenerateTaskPipeline
from core.app.task_pipeline.message_cycle_manager import MessageCycleManager
from core.base.tts import AppGeneratorTTSPublisher, AudioTrunk
from core.model_runtime.entities.llm_entities import LLMUsage
from core.ops.ops_trace_manager import TraceQueueManager
from core.workflow.entities.workflow_execution import WorkflowExecutionStatus, WorkflowType
from core.workflow.enums import SystemVariableKey
from core.workflow.graph_engine.entities.graph_runtime_state import GraphRuntimeState
from core.workflow.nodes import NodeType
from core.workflow.repositories.draft_variable_repository import DraftVariableSaverFactory
from core.workflow.repositories.workflow_execution_repository import WorkflowExecutionRepository
from core.workflow.repositories.workflow_node_execution_repository import WorkflowNodeExecutionRepository
from core.workflow.workflow_cycle_manager import CycleManagerWorkflowInfo, WorkflowCycleManager
from events.message_event import message_was_created
from extensions.ext_database import db
from models import Conversation, EndUser, Message, MessageFile
from models.account import Account
from models.enums import CreatorUserRole
from models.workflow import Workflow

logger = logging.getLogger(__name__)

# RAGFlow混合相似度配置常量
SIMILARITY_THRESHOLD_DEFAULT = 0.25  # 区域累积显示阈值：较低阈值
KEYWORDS_SIMILARITY_WEIGHT = 0.7  # RAGFlow默认关键词相似度权重
VECTOR_SIMILARITY_WEIGHT = 0.3  # RAGFlow默认向量相似度权重
MAX_CITATIONS_PER_SENTENCE = 3  # 每句最多引用数
REGION_SIZE_MIN = 3  # 区域大小最小值
REGION_SIZE_MAX = 5  # 区域大小最大值


class AdvancedChatAppGenerateTaskPipeline:
    """
    AdvancedChatAppGenerateTaskPipeline is a class that generate stream output and state management for Application.
    """

    def __init__(
        self,
        application_generate_entity: AdvancedChatAppGenerateEntity,
        workflow: Workflow,
        queue_manager: AppQueueManager,
        conversation: Conversation,
        message: Message,
        user: Union[Account, EndUser],
        stream: bool,
        dialogue_count: int,
        workflow_execution_repository: WorkflowExecutionRepository,
        workflow_node_execution_repository: WorkflowNodeExecutionRepository,
        draft_var_saver_factory: DraftVariableSaverFactory,
    ) -> None:
        self._base_task_pipeline = BasedGenerateTaskPipeline(
            application_generate_entity=application_generate_entity,
            queue_manager=queue_manager,
            stream=stream,
        )

        if isinstance(user, EndUser):
            self._user_id = user.id
            user_session_id = user.session_id
            self._created_by_role = CreatorUserRole.END_USER
        elif isinstance(user, Account):
            self._user_id = user.id
            user_session_id = user.id
            self._created_by_role = CreatorUserRole.ACCOUNT
        else:
            raise NotImplementedError(f"User type not supported: {type(user)}")

        self._workflow_cycle_manager = WorkflowCycleManager(
            application_generate_entity=application_generate_entity,
            workflow_system_variables={
                SystemVariableKey.QUERY: message.query,
                SystemVariableKey.FILES: application_generate_entity.files,
                SystemVariableKey.CONVERSATION_ID: conversation.id,
                SystemVariableKey.USER_ID: user_session_id,
                SystemVariableKey.DIALOGUE_COUNT: dialogue_count,
                SystemVariableKey.APP_ID: application_generate_entity.app_config.app_id,
                SystemVariableKey.WORKFLOW_ID: workflow.id,
                SystemVariableKey.WORKFLOW_EXECUTION_ID: application_generate_entity.workflow_run_id,
            },
            workflow_info=CycleManagerWorkflowInfo(
                workflow_id=workflow.id,
                workflow_type=WorkflowType(workflow.type),
                version=workflow.version,
                graph_data=workflow.graph_dict,
            ),
            workflow_execution_repository=workflow_execution_repository,
            workflow_node_execution_repository=workflow_node_execution_repository,
        )

        self._workflow_response_converter = WorkflowResponseConverter(
            application_generate_entity=application_generate_entity,
        )

        self._task_state = WorkflowTaskState()
        self._message_cycle_manager = MessageCycleManager(
            application_generate_entity=application_generate_entity, task_state=self._task_state
        )

        self._application_generate_entity = application_generate_entity
        self._workflow_id = workflow.id
        self._workflow_features_dict = workflow.features_dict
        self._conversation_id = conversation.id
        self._conversation_mode = conversation.mode
        self._message_id = message.id
        self._message_created_at = int(message.created_at.timestamp())
        self._conversation_name_generate_thread: Thread | None = None
        self._recorded_files: list[Mapping[str, Any]] = []
        self._workflow_run_id: str = ""
        self._draft_var_saver_factory = draft_var_saver_factory

        # 引用提示功能相关属性
        self._accumulated_text = ""
        self._in_code_block = False
        self._in_table = False
        self._table_content = ""

        # 累积相似度计算相关属性
        self._accumulated_content_buffer = ""  # 累积内容缓冲区
        self._accumulated_lines_count = 0  # 累积行数

        # 区域累积显示相关属性
        self._region_buffer = []  # 区域缓冲区，存储最近的3-5行
        self._region_has_match = False  # 当前区域是否有匹配的行
        self._current_region_size = self._generate_random_region_size()  # 当前区域大小（动态随机）

        # 新增：位置信息和引用提示收集
        self._citation_hints = []  # 引用提示列表
        self._current_position = 0  # 当前文本位置

    def process(self) -> Union[ChatbotAppBlockingResponse, Generator[ChatbotAppStreamResponse, None, None]]:
        """
        Process generate task pipeline.
        :return:
        """
        # start generate conversation name thread
        self._conversation_name_generate_thread = self._message_cycle_manager.generate_conversation_name(
            conversation_id=self._conversation_id, query=self._application_generate_entity.query
        )

        generator = self._wrapper_process_stream_response(trace_manager=self._application_generate_entity.trace_manager)

        if self._base_task_pipeline._stream:
            return self._to_stream_response(generator)
        else:
            return self._to_blocking_response(generator)

    def _to_blocking_response(self, generator: Generator[StreamResponse, None, None]) -> ChatbotAppBlockingResponse:
        """
        Process blocking response.
        :return:
        """
        for stream_response in generator:
            if isinstance(stream_response, ErrorStreamResponse):
                raise stream_response.err
            elif isinstance(stream_response, MessageEndStreamResponse):
                extras = {}
                if stream_response.metadata:
                    extras["metadata"] = stream_response.metadata

                return ChatbotAppBlockingResponse(
                    task_id=stream_response.task_id,
                    data=ChatbotAppBlockingResponse.Data(
                        id=self._message_id,
                        mode=self._conversation_mode,
                        conversation_id=self._conversation_id,
                        message_id=self._message_id,
                        answer=self._task_state.answer,
                        created_at=self._message_created_at,
                        **extras,
                    ),
                )
            else:
                continue

        raise ValueError("queue listening stopped unexpectedly.")

    def _to_stream_response(
        self, generator: Generator[StreamResponse, None, None]
    ) -> Generator[ChatbotAppStreamResponse, Any, None]:
        """
        To stream response.
        :return:
        """
        for stream_response in generator:
            yield ChatbotAppStreamResponse(
                conversation_id=self._conversation_id,
                message_id=self._message_id,
                created_at=self._message_created_at,
                stream_response=stream_response,
            )

    def _listen_audio_msg(self, publisher: AppGeneratorTTSPublisher | None, task_id: str):
        if not publisher:
            return None
        audio_msg = publisher.check_and_get_audio()
        if audio_msg and isinstance(audio_msg, AudioTrunk) and audio_msg.status != "finish":
            return MessageAudioStreamResponse(audio=audio_msg.audio, task_id=task_id)
        return None

    def _wrapper_process_stream_response(
        self, trace_manager: Optional[TraceQueueManager] = None
    ) -> Generator[StreamResponse, None, None]:
        tts_publisher = None
        task_id = self._application_generate_entity.task_id
        tenant_id = self._application_generate_entity.app_config.tenant_id
        features_dict = self._workflow_features_dict

        if (
            features_dict.get("text_to_speech")
            and features_dict["text_to_speech"].get("enabled")
            and features_dict["text_to_speech"].get("autoPlay") == "enabled"
        ):
            tts_publisher = AppGeneratorTTSPublisher(
                tenant_id, features_dict["text_to_speech"].get("voice"), features_dict["text_to_speech"].get("language")
            )

        for response in self._process_stream_response(tts_publisher=tts_publisher, trace_manager=trace_manager):
            while True:
                audio_response = self._listen_audio_msg(publisher=tts_publisher, task_id=task_id)
                if audio_response:
                    yield audio_response
                else:
                    break
            yield response

        start_listener_time = time.time()
        # timeout
        while (time.time() - start_listener_time) < TTS_AUTO_PLAY_TIMEOUT:
            try:
                if not tts_publisher:
                    break
                audio_trunk = tts_publisher.check_and_get_audio()
                if audio_trunk is None:
                    # release cpu
                    # sleep 20 ms ( 40ms => 1280 byte audio file,20ms => 640 byte audio file)
                    time.sleep(TTS_AUTO_PLAY_YIELD_CPU_TIME)
                    continue
                if audio_trunk.status == "finish":
                    break
                else:
                    start_listener_time = time.time()
                    yield MessageAudioStreamResponse(audio=audio_trunk.audio, task_id=task_id)
            except Exception:
                logger.exception(f"Failed to listen audio message, task_id: {task_id}")
                break
        if tts_publisher:
            yield MessageAudioEndStreamResponse(audio="", task_id=task_id)

    def _process_stream_response(
        self,
        tts_publisher: Optional[AppGeneratorTTSPublisher] = None,
        trace_manager: Optional[TraceQueueManager] = None,
    ) -> Generator[StreamResponse, None, None]:
        """
        Process stream response.
        :return:
        """
        # init fake graph runtime state
        graph_runtime_state: Optional[GraphRuntimeState] = None

        for queue_message in self._base_task_pipeline._queue_manager.listen():
            event = queue_message.event

            if isinstance(event, QueuePingEvent):
                yield self._base_task_pipeline._ping_stream_response()
            elif isinstance(event, QueueErrorEvent):
                with Session(db.engine, expire_on_commit=False) as session:
                    err = self._base_task_pipeline._handle_error(
                        event=event, session=session, message_id=self._message_id
                    )
                    session.commit()
                yield self._base_task_pipeline._error_to_stream_response(err)
                break
            elif isinstance(event, QueueWorkflowStartedEvent):
                # override graph runtime state
                graph_runtime_state = event.graph_runtime_state

                with Session(db.engine, expire_on_commit=False) as session:
                    # init workflow run
                    workflow_execution = self._workflow_cycle_manager.handle_workflow_run_start()
                    self._workflow_run_id = workflow_execution.id_
                    message = self._get_message(session=session)
                    if not message:
                        raise ValueError(f"Message not found: {self._message_id}")
                    message.workflow_run_id = workflow_execution.id_
                    workflow_start_resp = self._workflow_response_converter.workflow_start_to_stream_response(
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution=workflow_execution,
                    )
                    session.commit()

                yield workflow_start_resp
            elif isinstance(
                event,
                QueueNodeRetryEvent,
            ):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                with Session(db.engine, expire_on_commit=False) as session:
                    workflow_node_execution = self._workflow_cycle_manager.handle_workflow_node_execution_retried(
                        workflow_execution_id=self._workflow_run_id, event=event
                    )
                    node_retry_resp = self._workflow_response_converter.workflow_node_retry_to_stream_response(
                        event=event,
                        task_id=self._application_generate_entity.task_id,
                        workflow_node_execution=workflow_node_execution,
                    )
                    session.commit()

                if node_retry_resp:
                    yield node_retry_resp
            elif isinstance(event, QueueNodeStartedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                workflow_node_execution = self._workflow_cycle_manager.handle_node_execution_start(
                    workflow_execution_id=self._workflow_run_id, event=event
                )

                node_start_resp = self._workflow_response_converter.workflow_node_start_to_stream_response(
                    event=event,
                    task_id=self._application_generate_entity.task_id,
                    workflow_node_execution=workflow_node_execution,
                )

                if node_start_resp:
                    yield node_start_resp
            elif isinstance(event, QueueNodeSucceededEvent):
                # Record files if it's an answer node or end node
                if event.node_type in [NodeType.ANSWER, NodeType.END]:
                    self._recorded_files.extend(
                        self._workflow_response_converter.fetch_files_from_node_outputs(event.outputs or {})
                    )

                with Session(db.engine, expire_on_commit=False) as session:
                    workflow_node_execution = self._workflow_cycle_manager.handle_workflow_node_execution_success(
                        event=event
                    )

                    node_finish_resp = self._workflow_response_converter.workflow_node_finish_to_stream_response(
                        event=event,
                        task_id=self._application_generate_entity.task_id,
                        workflow_node_execution=workflow_node_execution,
                    )
                    session.commit()
                self._save_output_for_event(event, workflow_node_execution.id)

                if node_finish_resp:
                    yield node_finish_resp
            elif isinstance(
                event,
                QueueNodeFailedEvent
                | QueueNodeInIterationFailedEvent
                | QueueNodeInLoopFailedEvent
                | QueueNodeExceptionEvent,
            ):
                workflow_node_execution = self._workflow_cycle_manager.handle_workflow_node_execution_failed(
                    event=event
                )

                node_finish_resp = self._workflow_response_converter.workflow_node_finish_to_stream_response(
                    event=event,
                    task_id=self._application_generate_entity.task_id,
                    workflow_node_execution=workflow_node_execution,
                )
                if isinstance(event, QueueNodeExceptionEvent):
                    self._save_output_for_event(event, workflow_node_execution.id)

                if node_finish_resp:
                    yield node_finish_resp
            elif isinstance(event, QueueParallelBranchRunStartedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                parallel_start_resp = (
                    self._workflow_response_converter.workflow_parallel_branch_start_to_stream_response(
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution_id=self._workflow_run_id,
                        event=event,
                    )
                )

                yield parallel_start_resp
            elif isinstance(event, QueueParallelBranchRunSucceededEvent | QueueParallelBranchRunFailedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                parallel_finish_resp = (
                    self._workflow_response_converter.workflow_parallel_branch_finished_to_stream_response(
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution_id=self._workflow_run_id,
                        event=event,
                    )
                )

                yield parallel_finish_resp
            elif isinstance(event, QueueIterationStartEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                iter_start_resp = self._workflow_response_converter.workflow_iteration_start_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield iter_start_resp
            elif isinstance(event, QueueIterationNextEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                iter_next_resp = self._workflow_response_converter.workflow_iteration_next_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield iter_next_resp
            elif isinstance(event, QueueIterationCompletedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                iter_finish_resp = self._workflow_response_converter.workflow_iteration_completed_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield iter_finish_resp
            elif isinstance(event, QueueLoopStartEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                loop_start_resp = self._workflow_response_converter.workflow_loop_start_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield loop_start_resp
            elif isinstance(event, QueueLoopNextEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                loop_next_resp = self._workflow_response_converter.workflow_loop_next_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield loop_next_resp
            elif isinstance(event, QueueLoopCompletedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                loop_finish_resp = self._workflow_response_converter.workflow_loop_completed_to_stream_response(
                    task_id=self._application_generate_entity.task_id,
                    workflow_execution_id=self._workflow_run_id,
                    event=event,
                )

                yield loop_finish_resp
            elif isinstance(event, QueueWorkflowSucceededEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")

                if not graph_runtime_state:
                    raise ValueError("workflow run not initialized.")

                with Session(db.engine, expire_on_commit=False) as session:
                    workflow_execution = self._workflow_cycle_manager.handle_workflow_run_success(
                        workflow_run_id=self._workflow_run_id,
                        total_tokens=graph_runtime_state.total_tokens,
                        total_steps=graph_runtime_state.node_run_steps,
                        outputs=event.outputs,
                        conversation_id=self._conversation_id,
                        trace_manager=trace_manager,
                    )

                    workflow_finish_resp = self._workflow_response_converter.workflow_finish_to_stream_response(
                        session=session,
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution=workflow_execution,
                    )

                yield workflow_finish_resp
                self._base_task_pipeline._queue_manager.publish(
                    QueueAdvancedChatMessageEndEvent(), PublishFrom.TASK_PIPELINE
                )
            elif isinstance(event, QueueWorkflowPartialSuccessEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")
                if not graph_runtime_state:
                    raise ValueError("graph runtime state not initialized.")

                with Session(db.engine, expire_on_commit=False) as session:
                    workflow_execution = self._workflow_cycle_manager.handle_workflow_run_partial_success(
                        workflow_run_id=self._workflow_run_id,
                        total_tokens=graph_runtime_state.total_tokens,
                        total_steps=graph_runtime_state.node_run_steps,
                        outputs=event.outputs,
                        exceptions_count=event.exceptions_count,
                        conversation_id=None,
                        trace_manager=trace_manager,
                    )
                    workflow_finish_resp = self._workflow_response_converter.workflow_finish_to_stream_response(
                        session=session,
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution=workflow_execution,
                    )

                yield workflow_finish_resp
                self._base_task_pipeline._queue_manager.publish(
                    QueueAdvancedChatMessageEndEvent(), PublishFrom.TASK_PIPELINE
                )
            elif isinstance(event, QueueWorkflowFailedEvent):
                if not self._workflow_run_id:
                    raise ValueError("workflow run not initialized.")
                if not graph_runtime_state:
                    raise ValueError("graph runtime state not initialized.")

                with Session(db.engine, expire_on_commit=False) as session:
                    workflow_execution = self._workflow_cycle_manager.handle_workflow_run_failed(
                        workflow_run_id=self._workflow_run_id,
                        total_tokens=graph_runtime_state.total_tokens,
                        total_steps=graph_runtime_state.node_run_steps,
                        status=WorkflowExecutionStatus.FAILED,
                        error_message=event.error,
                        conversation_id=self._conversation_id,
                        trace_manager=trace_manager,
                        exceptions_count=event.exceptions_count,
                    )
                    workflow_finish_resp = self._workflow_response_converter.workflow_finish_to_stream_response(
                        session=session,
                        task_id=self._application_generate_entity.task_id,
                        workflow_execution=workflow_execution,
                    )
                    err_event = QueueErrorEvent(error=ValueError(f"Run failed: {workflow_execution.error_message}"))
                    err = self._base_task_pipeline._handle_error(
                        event=err_event, session=session, message_id=self._message_id
                    )

                yield workflow_finish_resp
                yield self._base_task_pipeline._error_to_stream_response(err)
                break
            elif isinstance(event, QueueStopEvent):
                if self._workflow_run_id and graph_runtime_state:
                    with Session(db.engine, expire_on_commit=False) as session:
                        workflow_execution = self._workflow_cycle_manager.handle_workflow_run_failed(
                            workflow_run_id=self._workflow_run_id,
                            total_tokens=graph_runtime_state.total_tokens,
                            total_steps=graph_runtime_state.node_run_steps,
                            status=WorkflowExecutionStatus.STOPPED,
                            error_message=event.get_stop_reason(),
                            conversation_id=self._conversation_id,
                            trace_manager=trace_manager,
                        )
                        workflow_finish_resp = self._workflow_response_converter.workflow_finish_to_stream_response(
                            session=session,
                            task_id=self._application_generate_entity.task_id,
                            workflow_execution=workflow_execution,
                        )
                        # Save message
                        self._save_message(session=session, graph_runtime_state=graph_runtime_state)
                        session.commit()

                    yield workflow_finish_resp
                elif event.stopped_by in (
                    QueueStopEvent.StopBy.INPUT_MODERATION,
                    QueueStopEvent.StopBy.ANNOTATION_REPLY,
                ):
                    # When hitting input-moderation or annotation-reply, the workflow will not start
                    with Session(db.engine, expire_on_commit=False) as session:
                        # Save message
                        self._save_message(session=session)
                        session.commit()

                yield self._message_end_to_stream_response()
                break
            elif isinstance(event, QueueRetrieverResourcesEvent):
                self._message_cycle_manager.handle_retriever_resources(event)

                with Session(db.engine, expire_on_commit=False) as session:
                    message = self._get_message(session=session)
                    message.message_metadata = self._task_state.metadata.model_dump_json()
                    session.commit()
            elif isinstance(event, QueueAnnotationReplyEvent):
                self._message_cycle_manager.handle_annotation_reply(event)

                with Session(db.engine, expire_on_commit=False) as session:
                    message = self._get_message(session=session)
                    message.message_metadata = self._task_state.metadata.model_dump_json()
                    session.commit()
            elif isinstance(event, QueueTextChunkEvent):
                delta_text = event.text
                if delta_text is None:
                    continue

                # handle output moderation chunk
                should_direct_answer = self._handle_output_moderation_chunk(delta_text)
                if should_direct_answer:
                    continue

                # only publish tts message at text chunk streaming
                if tts_publisher:
                    tts_publisher.publish(queue_message)

                # 处理文本并收集引用提示位置信息
                processed_delta_text = self._process_text_with_citation_metadata(delta_text)
                self._task_state.answer += processed_delta_text
                yield self._message_cycle_manager.message_to_stream_response(
                    answer=processed_delta_text,
                    message_id=self._message_id,
                    from_variable_selector=event.from_variable_selector,
                )
            elif isinstance(event, QueueMessageReplaceEvent):
                # published by moderation
                yield self._message_cycle_manager.message_replace_to_stream_response(
                    answer=event.text, reason=event.reason
                )
            elif isinstance(event, QueueAdvancedChatMessageEndEvent):
                if not graph_runtime_state:
                    raise ValueError("graph runtime state not initialized.")

                # 处理剩余的区域缓冲区并获取HTML标记
                remaining_html = self._process_remaining_region_buffer()
                if remaining_html:
                    self._task_state.answer += remaining_html
                    yield self._message_cycle_manager.message_to_stream_response(
                        answer=remaining_html,
                        message_id=self._message_id,
                    )

                output_moderation_answer = self._base_task_pipeline._handle_output_moderation_when_task_finished(
                    self._task_state.answer
                )
                if output_moderation_answer:
                    self._task_state.answer = output_moderation_answer
                    yield self._message_cycle_manager.message_replace_to_stream_response(
                        answer=output_moderation_answer,
                        reason=QueueMessageReplaceEvent.MessageReplaceReason.OUTPUT_MODERATION,
                    )

                # Save message
                with Session(db.engine, expire_on_commit=False) as session:
                    self._save_message(session=session, graph_runtime_state=graph_runtime_state)
                    session.commit()

                yield self._message_end_to_stream_response()
            elif isinstance(event, QueueAgentLogEvent):
                yield self._workflow_response_converter.handle_agent_log(
                    task_id=self._application_generate_entity.task_id, event=event
                )
            else:
                continue

        # publish None when task finished
        if tts_publisher:
            tts_publisher.publish(None)

        if self._conversation_name_generate_thread:
            self._conversation_name_generate_thread.join()

    def _save_message(self, *, session: Session, graph_runtime_state: Optional[GraphRuntimeState] = None) -> None:
        message = self._get_message(session=session)
        message.answer = self._task_state.answer
        message.provider_response_latency = time.perf_counter() - self._base_task_pipeline._start_at
        
        # 直接保存metadata，不再需要添加citation_hints
        message.message_metadata = self._task_state.metadata.model_dump_json()
        message_files = [
            MessageFile(
                message_id=message.id,
                type=file["type"],
                transfer_method=file["transfer_method"],
                url=file["remote_url"],
                belongs_to="assistant",
                upload_file_id=file["related_id"],
                created_by_role=CreatorUserRole.ACCOUNT
                if message.invoke_from in {InvokeFrom.EXPLORE, InvokeFrom.DEBUGGER}
                else CreatorUserRole.END_USER,
                created_by=message.from_account_id or message.from_end_user_id or "",
            )
            for file in self._recorded_files
        ]
        session.add_all(message_files)

        if graph_runtime_state and graph_runtime_state.llm_usage:
            usage = graph_runtime_state.llm_usage
            message.message_tokens = usage.prompt_tokens
            message.message_unit_price = usage.prompt_unit_price
            message.message_price_unit = usage.prompt_price_unit
            message.answer_tokens = usage.completion_tokens
            message.answer_unit_price = usage.completion_unit_price
            message.answer_price_unit = usage.completion_price_unit
            message.total_price = usage.total_price
            message.currency = usage.currency
            self._task_state.metadata.usage = usage
        else:
            self._task_state.metadata.usage = LLMUsage.empty_usage()
        message_was_created.send(
            message,
            application_generate_entity=self._application_generate_entity,
        )

    def _message_end_to_stream_response(self) -> MessageEndStreamResponse:
        """
        Message end to stream response.
        :return:
        """
        extras = self._task_state.metadata.model_dump()

        if self._task_state.metadata.annotation_reply:
            del extras["annotation_reply"]

        return MessageEndStreamResponse(
            task_id=self._application_generate_entity.task_id,
            id=self._message_id,
            files=self._recorded_files,
            metadata=extras,
        )

    def _handle_output_moderation_chunk(self, text: str) -> bool:
        """
        Handle output moderation chunk.
        :param text: text
        :return: True if output moderation should direct output, otherwise False
        """
        if self._base_task_pipeline._output_moderation_handler:
            if self._base_task_pipeline._output_moderation_handler.should_direct_output():
                # stop subscribe new token when output moderation should direct output
                self._task_state.answer = self._base_task_pipeline._output_moderation_handler.get_final_output()
                self._base_task_pipeline._queue_manager.publish(
                    QueueTextChunkEvent(text=self._task_state.answer), PublishFrom.TASK_PIPELINE
                )

                self._base_task_pipeline._queue_manager.publish(
                    QueueStopEvent(stopped_by=QueueStopEvent.StopBy.OUTPUT_MODERATION), PublishFrom.TASK_PIPELINE
                )
                return True
            else:
                self._base_task_pipeline._output_moderation_handler.append_new_token(text)

        return False

    def _get_message(self, *, session: Session):
        stmt = select(Message).where(Message.id == self._message_id)
        message = session.scalar(stmt)
        if not message:
            raise ValueError(f"Message not found: {self._message_id}")
        return message

    def _save_output_for_event(self, event: QueueNodeSucceededEvent | QueueNodeExceptionEvent, node_execution_id: str):
        with Session(db.engine) as session, session.begin():
            saver = self._draft_var_saver_factory(
                session=session,
                app_id=self._application_generate_entity.app_config.app_id,
                node_id=event.node_id,
                node_type=event.node_type,
                node_execution_id=node_execution_id,
                enclosing_node_id=event.in_loop_id or event.in_iteration_id,
            )
            saver.save(event.process_data, event.outputs)

    # =============================================================================
    # 引用提示图标功能方法
    # =============================================================================

    def _should_add_hint_icons(self) -> bool:
        """
        检查是否应该添加提示图标，复用'引用和归属'开关
        :return: True if should add hint icons
        """
        return self._application_generate_entity.app_config.additional_features.show_retrieve_source

    def _generate_random_region_size(self) -> int:
        """生成3-5之间的随机区域大小"""
        return secrets.randbelow(REGION_SIZE_MAX - REGION_SIZE_MIN + 1) + REGION_SIZE_MIN

    def _reset_accumulated_buffer(self):
        """重置累积缓冲区"""
        self._accumulated_content_buffer = ""
        self._accumulated_lines_count = 0

    def _reset_region_buffer(self):
        """重置区域缓冲区并生成新的随机区域大小"""
        self._region_buffer = []
        self._region_has_match = False
        self._current_region_size = self._generate_random_region_size()

    def _process_remaining_region_buffer(self):
        """处理剩余的区域缓冲区，返回HTML标记"""
        remaining_html = ""
        
        if self._region_buffer and self._region_has_match:
            # 为剩余区域生成引用提示
            region_start_pos = self._region_buffer[0]["start_pos"]
            region_end_pos = self._region_buffer[-1]["end_pos"]
            
            # 收集区域内所有相关chunks
            all_chunks_with_scores = []
            for line_info in self._region_buffer:
                line_chunks = self._find_relevant_chunks(line_info["text"])
                all_chunks_with_scores.extend(line_chunks)
            
            if all_chunks_with_scores:
                # 去重并按相似度排序
                unique_chunks = {}
                for chunk, score in all_chunks_with_scores:
                    if chunk.segment_id not in unique_chunks or unique_chunks[chunk.segment_id][1] < score:
                        unique_chunks[chunk.segment_id] = (chunk, score)
                
                sorted_chunks = sorted(unique_chunks.values(), key=lambda x: x[1], reverse=True)
                top_chunks = sorted_chunks[:MAX_CITATIONS_PER_SENTENCE]
                
                # 构建chunks数据
                chunks_data = []
                if hasattr(self._task_state.metadata, 'retriever_resources'):
                    chunk_map = {r.segment_id: r for r in self._task_state.metadata.retriever_resources}
                    for chunk, _ in top_chunks:
                        if chunk.segment_id in chunk_map:
                            resource = chunk_map[chunk.segment_id]
                            chunks_data.append({
                                "segment_id": resource.segment_id,
                                "document_name": resource.document_name,
                                "content": resource.content,
                                "score": resource.score,
                                "dataset_name": resource.dataset_name
                            })
                
                if chunks_data:
                    # 将chunks数据转换为JSON，确保中文字符正确编码
                    chunks_json = json.dumps(chunks_data, ensure_ascii=False)
                    # 转义HTML属性中的特殊字符
                    chunks_json = (chunks_json.replace('"', '&quot;')
                                  .replace('<', '&lt;')
                                  .replace('>', '&gt;'))
                    remaining_html = f' <hint-icon data-chunks="{chunks_json}"></hint-icon>'
                    logger.info(
                        f"最终区域引用提示: 位置({region_start_pos}-{region_end_pos}), "
                        f"区域大小: {len(self._region_buffer)}, chunks: {[c['segment_id'] for c in chunks_data]}"
                    )
        
        # 清空区域缓冲区
        self._region_buffer = []
        self._region_has_match = False
        
        return remaining_html

    def _clean_content_for_similarity(self, content: str) -> str:
        """
        清理内容用于相似度计算，只保留文字、数字和标点
        :param content: 原始内容
        :return: 清理后的内容
        """
        # 移除Markdown语法符号（保留文字、数字、中英文标点）
        # 移除：|、#、*、_、`、[]、()中的链接语法等
        cleaned = re.sub(r"[|#*_`\[\]{}\\]", " ", content)
        # 移除多余空格
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _is_table_row(self, line: str) -> bool:
        """
        检测是否是表格行（严格检测：必须以|开头和结尾）
        :param line: 文本行
        :return: True if is table row
        """
        stripped = line.strip()
        return stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 3

    def _is_table_separator(self, line: str) -> bool:
        """
        检测是否是表格分隔行（如 |---|---|
        :param line: 文本行
        :return: True if is table separator
        """
        stripped = line.strip()
        return bool(re.match(r"^\|[\s\-\|:]+\|$", stripped))

    def _is_simple_code_line(self, line: str) -> bool:
        """
        检测是否是简单的代码行（缩进代码）
        :param line: 文本行
        :return: True if is code line
        """
        stripped = line.strip()
        return (
            stripped.startswith("    ")  # 缩进代码
            or stripped.startswith("\t")  # tab缩进代码
        )

    def _calculate_lexical_similarity(self, text1: str, text2: str) -> float:
        """
        计算两个文本的词汇相似度（关键词相似度）
        :param text1: 文本1
        :param text2: 文本2
        :return: 相似度分数 (0-1)
        """
        # 清理内容
        clean_text1 = self._clean_content_for_similarity(text1).lower()
        clean_text2 = self._clean_content_for_similarity(text2).lower()

        if not clean_text1 or not clean_text2:
            return 0.0

        # 简单的词汇重叠度计算（Jaccard相似度）
        words1 = set(clean_text1.split())
        words2 = set(clean_text2.split())

        if not words1 or not words2:
            return 0.0

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        return len(intersection) / len(union) if union else 0.0

    def _calculate_hybrid_similarity(
        self, text1: str, text2: str, chunk_resource, keywords_weight: float = 0.7, vector_weight: float = 0.3
    ) -> float:
        """
        计算混合相似度（词汇相似度 + 向量相似度），模仿RAGFlow实现
        :param text1: 查询文本
        :param text2: 分块内容
        :param chunk_resource: 检索资源，包含向量相似度信息
        :param keywords_weight: 关键词相似度权重（默认0.7，参考RAGFlow）
        :param vector_weight: 向量相似度权重（默认0.3，参考RAGFlow）
        :return: 混合相似度分数 (0-1)
        """
        # 计算词汇（关键词）相似度
        term_similarity = self._calculate_lexical_similarity(text1, text2)

        # 获取向量相似度（如果可用）
        vector_similarity = 0.0
        if hasattr(chunk_resource, "vector_similarity") and chunk_resource.vector_similarity is not None:
            vector_similarity = chunk_resource.vector_similarity
        elif hasattr(chunk_resource, "score") and chunk_resource.score is not None:
            # 如果没有单独的向量相似度，使用总体score作为近似
            vector_similarity = chunk_resource.score

        # 计算加权混合相似度（参考RAGFlow公式）
        # similarity = weighted_keyword_similarity + weighted_vector_similarity
        hybrid_similarity = (keywords_weight * term_similarity) + (vector_weight * vector_similarity)

        # 调试日志（仅在开发时输出）
        logger.debug(
            f"混合相似度计算: term_sim={term_similarity:.3f}, vector_sim={vector_similarity:.3f}, "
            f"hybrid_sim={hybrid_similarity:.3f}"
        )

        # 确保结果在[0,1]范围内
        return min(1.0, max(0.0, hybrid_similarity))

    def _find_relevant_chunks(self, content: str, threshold: float | None = None):
        """
        找到与内容相关的检索分块，使用RAGFlow混合相似度算法
        :param content: 要比较的内容
        :param threshold: 混合相似度阈值（默认使用SIMILARITY_THRESHOLD_DEFAULT）
        :return: 相关的分块列表
        """
        if threshold is None:
            threshold = SIMILARITY_THRESHOLD_DEFAULT

        retriever_resources = self._task_state.metadata.retriever_resources
        if not retriever_resources:
            return []

        relevant_chunks = []
        for resource in retriever_resources:
            if resource.content:
                # 使用RAGFlow混合相似度算法
                hybrid_similarity = self._calculate_hybrid_similarity(
                    content,
                    resource.content,
                    resource,
                    keywords_weight=KEYWORDS_SIMILARITY_WEIGHT,  # RAGFlow默认关键词权重
                    vector_weight=VECTOR_SIMILARITY_WEIGHT,  # RAGFlow默认向量权重
                )

                logger.debug(
                    f"分块内容: '{resource.content[:30]}...' 混合相似度: {hybrid_similarity:.3f} "
                    f"(阈值: {threshold}) 是否匹配: {hybrid_similarity >= threshold}"
                )

                if hybrid_similarity >= threshold:
                    relevant_chunks.append((resource, hybrid_similarity))

        # 按混合相似度排序
        relevant_chunks.sort(key=lambda x: x[1], reverse=True)

        # 返回最多MAX_CITATIONS_PER_SENTENCE个最相关的分块（返回带混合相似度的元组）
        return relevant_chunks[:MAX_CITATIONS_PER_SENTENCE]

    def _generate_hint_html_from_chunks(self, chunks_with_scores) -> str:
        """
        直接从给定的chunks生成HTML标记（避免重新计算相似度）
        :param chunks_with_scores: 相关的分块列表，每个元素是(chunk, hybrid_score)元组
        :return: HTML标记字符串
        """
        if not chunks_with_scores:
            return ""

        # 构建增强的数据属性
        chunks_data = []
        for chunk, hybrid_score in chunks_with_scores:
            # 清理和截断内容
            chunk_content = chunk.content if chunk.content else ""
            # 移除多余的空白字符并截断
            chunk_content = " ".join(chunk_content.split())[:200]

            chunk_info = {
                "id": chunk.segment_id or "",
                "content": chunk_content,
                "document_name": chunk.document_name or "未知文档",
                "score": float(hybrid_score),  # 使用混合相似度
            }
            chunks_data.append(chunk_info)

        # 使用分块的segment_id作为data-chunk-ids
        chunk_ids = [chunk.segment_id for chunk, _ in chunks_with_scores if chunk.segment_id]
        if not chunk_ids:
            logger.debug("相关分块没有segment_id，不显示图标")
            return ""

        # 生成带有详细信息的HTML
        chunks_json = json.dumps(chunks_data, ensure_ascii=False)
        # HTML转义以防止XSS
        chunks_json_escaped = html.escape(chunks_json)

        logger.info(f"直接生成图标，chunk_ids: {chunk_ids}, 包含 {len(chunks_data)} 个引用")
        return f'<hint-icon data-chunk-ids="{",".join(chunk_ids)}" data-chunks="{chunks_json_escaped}"></hint-icon>'

    def _generate_smart_hint_html(self, content: str) -> str:
        """
        基于内容相似度生成智能提示图标HTML标记
        :param content: 要分析的内容
        :return: HTML标记字符串，如果没有相关分块则返回空字符串
        """
        # 内容长度检查 - 太短的内容不显示图标
        clean_content = self._clean_content_for_similarity(content).strip()
        if len(clean_content) < 10:
            logger.debug(f"内容太短 ({len(clean_content)}字符)，不显示图标")
            return ""

        # 检查是否有检索资源
        retriever_resources = self._task_state.metadata.retriever_resources
        logger.debug(f"检索资源数量: {len(retriever_resources) if retriever_resources else 0}")

        if not retriever_resources:
            logger.debug("没有检索资源，不显示图标")
            return ""

        relevant_chunks_with_scores = self._find_relevant_chunks(content)
        logger.debug(f"内容: '{content[:50]}...' 找到相关分块: {len(relevant_chunks_with_scores)}")

        if not relevant_chunks_with_scores:
            logger.debug("没有找到相关分块，不显示图标")
            return ""

        # 构建增强的数据属性
        chunks_data = []
        for chunk, hybrid_score in relevant_chunks_with_scores:
            # 清理和截断内容
            chunk_content = chunk.content if chunk.content else ""
            # 移除多余的空白字符并截断
            chunk_content = " ".join(chunk_content.split())[:200]

            chunk_info = {
                "id": chunk.segment_id or "",
                "content": chunk_content,
                "document_name": chunk.document_name or "未知文档",
                "score": float(hybrid_score),  # 使用混合相似度而不是原始score
            }
            chunks_data.append(chunk_info)

        # 使用分块的segment_id作为data-chunk-ids
        chunk_ids = [chunk.segment_id for chunk, _ in relevant_chunks_with_scores if chunk.segment_id]
        if not chunk_ids:
            logger.debug("相关分块没有segment_id，不显示图标")
            return ""

        # 生成带有详细信息的HTML
        chunks_json = json.dumps(chunks_data, ensure_ascii=False)
        # HTML转义以防止XSS
        chunks_json_escaped = html.escape(chunks_json)

        logger.info(f"生成图标，chunk_ids: {chunk_ids}, 包含 {len(chunks_data)} 个引用")
        return f'<hint-icon data-chunk-ids="{",".join(chunk_ids)}" data-chunks="{chunks_json_escaped}"></hint-icon>'

    def _process_region_content(self, new_line: str, threshold: float | None = None) -> tuple[str, bool]:
        """
        区域累积显示策略：在一个小区域（3-5行）内如果任意一行超过阈值，就在区域末尾显示一个图标
        :param new_line: 新的行内容
        :param threshold: 相似度阈值（较低，如0.25）
        :return: (处理后的文本, 是否应该显示图标)
        """
        if threshold is None:
            threshold = SIMILARITY_THRESHOLD_DEFAULT

        # 将新行加入区域缓冲区
        self._region_buffer.append(new_line)

        # 检查当前行是否匹配阈值
        relevant_chunks_with_scores = self._find_relevant_chunks(new_line, threshold)
        if relevant_chunks_with_scores:
            self._region_has_match = True
            logger.info(f"区域内发现匹配行: '{new_line[:30]}...' 相似度超过阈值 {threshold}")

        # 如果区域达到当前指定大小，决定是否显示图标
        if len(self._region_buffer) >= self._current_region_size:
            should_show_icon = self._region_has_match

            if should_show_icon:
                # 获取最佳匹配的chunks（从整个区域中选择最佳匹配）
                best_chunks_with_scores = None
                best_similarity = 0.0

                # 遍历区域内的每一行，找到最佳匹配
                for idx, line in enumerate(self._region_buffer):
                    line_chunks_with_scores = self._find_relevant_chunks(line, threshold)
                    if line_chunks_with_scores:
                        # 计算这行的最高相似度
                        max_sim = max(score for _, score in line_chunks_with_scores)

                        chunk_count = len(line_chunks_with_scores)
                        logger.debug(f"第{idx + 1}行: '{line[:30]}...' 找到{chunk_count}个chunks, 相似度{max_sim:.3f}")

                        if max_sim > best_similarity:
                            best_similarity = max_sim
                            best_chunks_with_scores = line_chunks_with_scores
                            chunk_ids = [chunk.segment_id for chunk, _ in line_chunks_with_scores]
                            logger.debug(f"更新最佳匹配: 相似度{max_sim:.3f}, chunks: {chunk_ids}")

                if best_chunks_with_scores:
                    # 直接使用找到的最佳chunks生成HTML标记
                    hint_html = self._generate_hint_html_from_chunks(best_chunks_with_scores)
                    if hint_html:
                        logger.info(
                            f"区域累积显示图标: 区域大小={len(self._region_buffer)}, "
                            f"最佳相似度={best_similarity:.3f}, chunk数量={len(best_chunks_with_scores)}"
                        )
                        self._reset_region_buffer()
                        return new_line + f" {hint_html}", True

            # 区域结束，无论是否显示图标都要重置
            logger.info(
                f"区域结束: 大小={len(self._region_buffer)}, "
                f"有匹配={self._region_has_match}, 显示图标={should_show_icon}"
            )
            self._reset_region_buffer()

        return new_line, False

    def _add_hint_icons_to_complete_lines(self, text: str) -> str:
        """
        为完整的行添加智能提示图标HTML标记，支持表格处理
        :param text: 原始文本
        :return: 处理后的文本
        """
        if not self._should_add_hint_icons():
            return text

        lines = text.split("\n")
        processed_lines = []
        table_buffer = []
        in_table = False

        for i, line in enumerate(lines):
            # 检查代码块状态
            if line.strip().startswith("```"):
                self._in_code_block = not self._in_code_block
                processed_lines.append(line)
                continue

            # 如果在代码块中，直接添加不处理
            if self._in_code_block:
                processed_lines.append(line)
                continue

            # 检查表格状态
            is_table_row = self._is_table_row(line)
            is_table_sep = self._is_table_separator(line)

            if is_table_row or is_table_sep:
                # 进入或继续表格
                if not in_table:
                    in_table = True
                table_buffer.append(line)
            else:
                # 不是表格行
                if in_table:
                    # 表格结束，处理整个表格
                    if table_buffer:
                        table_content = "\n".join(table_buffer)
                        hint_html = self._generate_smart_hint_html(table_content)
                        if hint_html:
                            # 在表格最后一行添加提示图标
                            if table_buffer:
                                table_buffer[-1] += f" {hint_html}"
                        processed_lines.extend(table_buffer)
                        table_buffer = []
                    in_table = False

                # 处理普通行
                if line.strip() and not self._is_simple_code_line(line):
                    # 为非最后一行添加智能HTML标记
                    if i < len(lines) - 1:
                        hint_html = self._generate_smart_hint_html(line)
                        if hint_html:
                            processed_lines.append(f"{line} {hint_html}")
                        else:
                            processed_lines.append(line)
                    else:
                        processed_lines.append(line)
                else:
                    processed_lines.append(line)

        # 处理最后的表格（如果文本以表格结尾）
        if in_table and table_buffer:
            table_content = "\n".join(table_buffer)
            hint_html = self._generate_smart_hint_html(table_content)
            if hint_html and table_buffer:
                table_buffer[-1] += f" {hint_html}"
            processed_lines.extend(table_buffer)

        return "\n".join(processed_lines)

    def _process_text_with_hints(self, delta_text: str) -> str:
        """
        处理流式文本，支持表格智能处理和相似度计算
        :param delta_text: 增量文本
        :return: 处理后的文本
        """
        logger.debug(f"提示图标处理: delta_text='{delta_text[:50]}...' should_add={self._should_add_hint_icons()}")

        if not self._should_add_hint_icons():
            return delta_text

        # 简化处理：直接在换行符前添加HTML标记
        if "\n" in delta_text:
            # 查找并替换完整行的结尾
            processed_text = ""
            parts = delta_text.split("\n")

            for i, part in enumerate(parts):
                if i < len(parts) - 1:  # 不是最后一部分
                    # 这是一个完整行的结尾
                    combined_line = self._accumulated_text + part

                    # 检查代码块状态
                    if combined_line.strip().startswith("```"):
                        self._in_code_block = not self._in_code_block
                        # 进入或退出代码块时，重置区域缓冲区
                        self._reset_region_buffer()
                        processed_text += part + "\n"
                    elif self._in_code_block:
                        # 在代码块中，不添加图标
                        processed_text += part + "\n"
                    elif self._is_table_row(combined_line) or self._is_table_separator(combined_line):
                        # 表格行，累积到表格内容中
                        if not self._in_table:
                            self._in_table = True
                            self._table_content = ""
                            # 进入表格时，重置区域缓冲区
                            self._reset_region_buffer()
                        self._table_content += combined_line + "\n"
                        processed_text += part + "\n"
                    else:
                        # 普通行
                        if self._in_table:
                            # 表格结束，处理累积的表格内容，并重置区域缓冲区
                            if self._table_content.strip():
                                hint_html = self._generate_smart_hint_html(self._table_content.strip())
                                if hint_html:
                                    # 在上一行（表格最后一行）添加图标
                                    lines = processed_text.rstrip("\n").split("\n")
                                    if lines:
                                        lines[-1] += f" {hint_html}"
                                        processed_text = "\n".join(lines) + "\n"
                            self._in_table = False
                            self._table_content = ""
                            # 表格结束后，重置区域缓冲区，重新开始区域累积
                            self._reset_region_buffer()

                        # 处理当前普通行 - 使用区域累积显示策略
                        if combined_line.strip() and not self._is_simple_code_line(combined_line):
                            logger.info(f"调用区域处理: '{combined_line.strip()[:30]}...'")
                            # 使用区域累积显示策略
                            processed_line, icon_added = self._process_region_content(combined_line.strip())
                            if icon_added:
                                processed_text += processed_line + "\n"
                            else:
                                processed_text += part + "\n"
                        else:
                            processed_text += part + "\n"

                    self._accumulated_text = ""  # 重置累积文本
                else:
                    # 最后一部分，累积起来
                    processed_text += part
                    self._accumulated_text = part

            return processed_text
        else:
            # 没有换行符，累积文本
            self._accumulated_text += delta_text
            return delta_text

    def _process_text_with_citation_metadata(self, delta_text: str) -> str:
        """
        处理流式文本，直接在文本中插入引用提示标记
        :param delta_text: 增量文本
        :return: 包含引用提示标记的文本
        """
        if not self._should_add_hint_icons():
            self._current_position += len(delta_text)
            return delta_text

        if "\n" in delta_text:
            # 处理包含换行符的文本
            processed_text = ""
            parts = delta_text.split("\n")

            for i, part in enumerate(parts):
                if i < len(parts) - 1:  # 不是最后一部分（完整行）
                    combined_line = self._accumulated_text + part
                    line_start_pos = self._current_position - len(self._accumulated_text)
                    line_end_pos = self._current_position + len(part)

                    # 检查代码块状态
                    if combined_line.strip().startswith("```"):
                        self._in_code_block = not self._in_code_block
                        self._reset_region_buffer()
                    elif (not self._in_code_block and 
                          not self._is_table_row(combined_line) and 
                          not self._is_simple_code_line(combined_line)):
                        # 对于普通文本行，使用区域累积逻辑
                        if combined_line.strip():  # 非空行
                            # 将行添加到区域缓冲区
                            line_data = {
                                "text": combined_line.strip(),
                                "start_pos": line_start_pos,
                                "end_pos": line_end_pos
                            }
                            self._region_buffer.append(line_data)
                            
                            # 检查当前行是否有匹配的chunks
                            relevant_chunks_with_scores = self._find_relevant_chunks(combined_line.strip())
                            if relevant_chunks_with_scores:
                                self._region_has_match = True
                            
                            # 检查是否达到区域大小限制
                            if len(self._region_buffer) >= self._current_region_size:
                                if self._region_has_match:
                                    # 为整个区域生成一个引用提示（在区域末尾）
                                    region_start_pos = self._region_buffer[0]["start_pos"]
                                    region_end_pos = self._region_buffer[-1]["end_pos"]
                                    
                                    # 收集区域内所有相关chunks
                                    all_chunks_with_scores = []
                                    for line_info in self._region_buffer:
                                        line_chunks = self._find_relevant_chunks(line_info["text"])
                                        all_chunks_with_scores.extend(line_chunks)
                                    
                                    if all_chunks_with_scores:
                                        # 去重并按相似度排序
                                        unique_chunks = {}
                                        for chunk, score in all_chunks_with_scores:
                                            if (chunk.segment_id not in unique_chunks or 
                                            unique_chunks[chunk.segment_id][1] < score):
                                                unique_chunks[chunk.segment_id] = (chunk, score)
                                        
                                        sorted_chunks = sorted(unique_chunks.values(), key=lambda x: x[1], reverse=True)
                                        top_chunks = sorted_chunks[:MAX_CITATIONS_PER_SENTENCE]
                                        
                                        hint_data = {
                                            "text_range": {"start": region_start_pos, "end": region_end_pos},
                                            "chunk_ids": [
                                                chunk.segment_id for chunk, _ in top_chunks 
                                                if chunk.segment_id
                                            ],
                                            "confidence": max(score for _, score in top_chunks) if top_chunks else 0.0
                                        }
                                        
                                        if hint_data["chunk_ids"]:
                                            self._citation_hints.append(hint_data)
                                            logger.info(
                                                f"区域引用提示: 位置({region_start_pos}-{region_end_pos}), "
                                                f"区域大小: {len(self._region_buffer)}, "
                                                f"chunks: {hint_data['chunk_ids']}, "
                                                f"相似度: {hint_data['confidence']:.3f}"
                                            )
                                            
                                            # 直接在文本中插入引用提示标记
                                            # 使用retriever_resources中的数据构建chunks数据
                                            chunks_data = []
                                            if hasattr(self._task_state.metadata, 'retriever_resources'):
                                                chunk_map = {
                                                    r.segment_id: r 
                                                    for r in self._task_state.metadata.retriever_resources
                                                }
                                                for chunk_id in hint_data["chunk_ids"]:
                                                    if chunk_id in chunk_map:
                                                        resource = chunk_map[chunk_id]
                                                        chunks_data.append({
                                                            "segment_id": resource.segment_id,
                                                            "document_name": resource.document_name,
                                                            "content": resource.content,
                                                            "score": resource.score,
                                                            "dataset_name": resource.dataset_name
                                                        })
                                            
                                            if chunks_data:
                                                # 将chunks数据转换为JSON，确保中文字符正确编码
                                                chunks_json = json.dumps(chunks_data, ensure_ascii=False)
                                                # 转义HTML属性中的特殊字符
                                                chunks_json = (chunks_json.replace('"', '&quot;')
                                                              .replace('<', '&lt;')
                                                              .replace('>', '&gt;'))
                                                # 在当前位置插入hint-icon标记
                                                processed_text = processed_text.rstrip()  # 移除末尾空白
                                                processed_text += (
                                                    f' <hint-icon data-chunks="{chunks_json}"></hint-icon>\n'
                                                )
                                
                                # 重置区域缓冲区
                                self._reset_region_buffer()

                    # 如果没有添加hint-icon，正常添加换行符
                    if not processed_text.rstrip().endswith('</hint-icon>'):
                        processed_text += part + "\n"
                    
                    self._current_position += len(part) + 1
                    self._accumulated_text = ""
                else:
                    # 最后一部分，累积起来
                    processed_text += part
                    self._accumulated_text = part
                    self._current_position += len(part)

            return processed_text
        else:
            # 没有换行符，累积文本
            self._accumulated_text += delta_text
            self._current_position += len(delta_text)
            return delta_text
