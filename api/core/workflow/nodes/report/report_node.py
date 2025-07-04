import io
from collections.abc import Generator
from typing import cast
from uuid import uuid4

from core.helper.report_generator.report_generator import DocxTemplateRender
from core.variables import ArrayFileSegment
from core.workflow.entities.node_entities import NodeRunResult
from core.workflow.entities.workflow_node_execution import WorkflowNodeExecutionStatus
from core.workflow.nodes.base import BaseNode
from core.workflow.nodes.report.entities import ReportNodeData
from core.workflow.nodes.tool.tool_node import ToolNode
from extensions.ext_database import db
from extensions.ext_storage import storage
from models import Report

class ReportNotExistError(Exception):
    pass

class ReportNode(BaseNode[ReportNodeData]):

    @classmethod
    def version(cls) -> str:
        return "1"

    def _run(self) -> NodeRunResult:
        """
        Run the agent node
        """
        node_data = cast(ReportNodeData, self.node_data)

        variables = {}
        for variable_selector in node_data.variables:
            variable_name = variable_selector.variable
            variable = self.graph_runtime_state.variable_pool.get(variable_selector.value_selector)
            if isinstance(variable, ArrayFileSegment):
                variables[variable_name] = [v.to_dict() for v in variable.value] if variable.value else None
            else:
                variables[variable_name] = variable.to_object() if variable else None

        print("------------------")
        print(variables)
        print("------------------")
        try:

            # Transform result
            result = self._generate_reports(node_data, variables)
        except ReportNotExistError as e:
            return NodeRunResult(
                status=WorkflowNodeExecutionStatus.FAILED, inputs=variables, error=str(e), error_type=type(e).__name__
            )

        return NodeRunResult(status=WorkflowNodeExecutionStatus.SUCCEEDED, inputs=variables, outputs={"result": result})

    def _generate_reports(self, node_data: ReportNodeData, variables) -> list[str]:
        available_reports = []
        report_ids = node_data.report_ids

        results = (
            db.session.query(Report)
            .filter(Report.name.in_(report_ids))
            .all()
        )

        for report in results:
            # pass if dataset is not available
            if not report:
                continue
            object_name = report.url

            if not storage.exists(object_name):
                raise ReportNotExistError(f"{object_name} 模板文件不存在，请先编辑对应的报告模板")

            file_content = storage.load_once(object_name)
            doc_parse = DocxTemplateRender(file_content=io.BytesIO(file_content))
            output_doc = doc_parse.render(variables)
            output_content = io.BytesIO()
            output_doc.save(output_content)
            output_content.seek(0)

            # minio的临时目录
            tmp_object_name = f"report/{uuid4().hex}/{object_name}"
            # upload file to minio
            storage.save(tmp_object_name, output_content.read())

            available_reports.append(tmp_object_name)

        return available_reports
