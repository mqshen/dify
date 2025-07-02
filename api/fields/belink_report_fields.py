from flask_restful import fields

from libs.helper import TimestampField

belink_report_detail_fields = {
    "id": fields.String,
    "name": fields.String,
    "url": fields.String,
    "created_by": fields.String,
    "created_at": TimestampField,
    "updated_by": fields.String,
    "updated_at": TimestampField,
}
