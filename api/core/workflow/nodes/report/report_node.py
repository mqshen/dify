import io
from uuid import uuid4

from core.helper.report_generator.report_generator import DocxTemplateRender
from core.variables import ArrayFileSegment
from core.workflow.entities.node_entities import NodeRunResult
from core.workflow.entities.workflow_node_execution import WorkflowNodeExecutionStatus
from core.workflow.nodes import NodeType
from core.workflow.nodes.base import BaseNode
from core.workflow.nodes.report.entities import ReportNodeData
from extensions.ext_database import db
from extensions.ext_storage import storage
from models import Report


class ReportNotExistError(Exception):
    pass

class ReportNode(BaseNode[ReportNodeData]):
    _node_data_cls = ReportNodeData
    _node_type = NodeType.REPORT

    @classmethod
    def version(cls) -> str:
        return "1"

    def _run(self) -> NodeRunResult:
        """
        Run the agent node
        """
        # node_data = cast(ReportNodeData, self.node_data)

        variables = {}
        for variable_selector in self.node_data.variables:
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
            result = self._generate_reports(variables)
        except ReportNotExistError as e:
            return NodeRunResult(
                status=WorkflowNodeExecutionStatus.FAILED, inputs=variables, error=str(e), error_type=type(e).__name__
            )

        return NodeRunResult(status=WorkflowNodeExecutionStatus.SUCCEEDED, inputs=variables, outputs={"result": result})

    def _generate_reports(self, variables) -> list[str]:
        available_reports = []
        report_id = self.node_id

        print("------------------")
        print(f"start process report id :{report_id} success")
        print("------------------")
        report = db.session.query(Report).filter_by(node_id=report_id).first()

        if report :
            # pass if dataset is not available
            object_name = report.url
            print("------------------")
            print(f"start process report name :{object_name} success")
            print("------------------")

            if not storage.exists(object_name):
                raise ReportNotExistError(f"{object_name} 模板文件不存在，请先编辑对应的报告模板")

            print("------------------ start load file0000000000")
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

            print("------------------")
            print(f"upload file {tmp_object_name} success")
            print("------------------")

            available_reports.append(tmp_object_name)

        return available_reports

# if __name__ == '__main__':
#     variables = {'tt': 'ede59869-d180-460e-be42-81db6bcc1c8a', 'ssdf2': 'e25e166e-7be7-48e0-9c05-56b7663b22ca'}
#     doc_parse = DocxTemplateRender(filepath="/Users/goldratio/Downloads/uv/37cdc3b1-5bfc-47cb-adca-22774cc0d186.docx")
#     output_doc = doc_parse.render(variables)
#     output_content = io.BytesIO()
#     output_doc.save(output_content)
#     output_content.seek(0)
#
#     # minio的临时目录
#     tmp_object_name = "test.docx"
#     # upload file to minio
#     with open(tmp_object_name, "wb") as file:
#         file.write(output_content.read())
