from services.errors.base import BaseServiceError


class DocumentIndexingError(BaseServiceError):
    pass

class DocumentNameDuplicateError(BaseServiceError):
    pass
