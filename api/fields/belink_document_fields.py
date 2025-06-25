from flask_restful import fields

from libs.helper import TimestampField

belink_document_detail_fields = {
    "id": fields.String,
    "name": fields.String,
    "description": fields.String,
    "created_by": fields.String,
    "created_at": TimestampField,
    "updated_by": fields.String,
    "updated_at": TimestampField,
}
