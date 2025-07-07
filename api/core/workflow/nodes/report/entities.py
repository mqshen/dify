from core.workflow.entities.variable_entities import VariableSelector
from core.workflow.nodes.base.entities import BaseNodeData

class ReportNodeData(BaseNodeData):
    variables: list[VariableSelector]


