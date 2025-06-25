
from sqlalchemy import select

from extensions.ext_database import db
from models.document import (
    Document,
)


class DocumentService:
    @staticmethod
    def get_datasets(page, per_page, tenant_id=None, user=None, search=None, tag_ids=None, include_all=False):
        query = select(Document).filter(Document.tenant_id == tenant_id).order_by(Document.created_at.desc())

        if search:
            query = query.filter(Document.name.ilike(f"%{search}%"))


        documents = db.paginate(select=query, page=page, per_page=per_page, max_per_page=100, error_out=False)

        return documents.items, documents.total

    @staticmethod
    def get_documents_by_ids(ids, tenant_id):
        stmt = select(Document).filter(Document.id.in_(ids), Document.tenant_id == tenant_id)

        documents = db.paginate(select=stmt, page=1, per_page=len(ids), max_per_page=len(ids), error_out=False)

        return documents.items, documents.total
