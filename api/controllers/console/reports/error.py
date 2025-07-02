from libs.exception import BaseHTTPException


class DocumentNameDuplicateError(BaseHTTPException):
    error_code = "document_name_duplicate"
    description = "The document name already exists. Please modify your dataset name."
    code = 409
