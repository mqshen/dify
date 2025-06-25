from sqlalchemy import func

from .base import Base
from .engine import db
from .types import StringUUID


class Document(Base):
    __tablename__ = "belink_document"
    __table_args__ = (
        db.PrimaryKeyConstraint("id", name="belink_document_pkey"),
        db.Index("belink_document_tenant_idx", "tenant_id"),
    )

    id = db.Column(StringUUID, server_default=db.text("uuid_generate_v4()"))
    tenant_id = db.Column(StringUUID, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=True)
    created_by = db.Column(StringUUID, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=func.current_timestamp())
    updated_by = db.Column(StringUUID, nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, server_default=func.current_timestamp())
