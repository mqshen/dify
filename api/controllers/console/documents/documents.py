from flask import request
from flask_login import current_user
from flask_restful import Resource, marshal, reqparse
from werkzeug.exceptions import Forbidden

import services
from controllers.console import api
from controllers.console.documents.error import DocumentNameDuplicateError
from controllers.console.wraps import (
    account_initialization_required,
    cloud_edition_billing_rate_limit_check,
    setup_required,
)
from fields.belink_document_fields import belink_document_detail_fields
from libs.login import login_required
from services.document_service import DocumentService


def _validate_name(name):
    if not name or len(name) < 1 or len(name) > 40:
        raise ValueError("Name must be between 1 to 40 characters.")
    return name

class DocumentListApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    def get(self):
        page = request.args.get("page", default=1, type=int)
        limit = request.args.get("limit", default=20, type=int)
        ids = request.args.getlist("ids")
        # provider = request.args.get("provider", default="vendor")
        search = request.args.get("keyword", default=None, type=str)
        tag_ids = request.args.getlist("tag_ids")
        include_all = request.args.get("include_all", default="false").lower() == "true"
        if ids:
            datasets, total = DocumentService.get_documents_by_ids(ids, current_user.current_tenant_id)
        else:
            datasets, total = DocumentService.get_documents(
                page, limit, current_user.current_tenant_id, current_user, search, tag_ids, include_all
            )

        data = marshal(datasets, belink_document_detail_fields)

        response = {"data": data, "has_more": len(datasets) == limit, "limit": limit, "total": total, "page": page}
        return response, 200

    @setup_required
    @login_required
    @account_initialization_required
    @cloud_edition_billing_rate_limit_check("knowledge")
    def post(self):
        parser = reqparse.RequestParser()
        parser.add_argument(
            "name",
            nullable=False,
            required=True,
            help="type is required. Name must be between 1 to 40 characters.",
            type=_validate_name,
        )
        parser.add_argument(
            "content",
            type=str,
            nullable=True,
            required=False,
            default="",
        )
        args = parser.parse_args()

        # The role of the current user in the ta table must be admin, owner, or editor, or dataset_operator
        if not current_user.is_dataset_editor:
            raise Forbidden()

        try:
            dataset = DocumentService.create_empty_document(
                tenant_id=current_user.current_tenant_id,
                name=args["name"],
                content=args["content"],
                account=current_user,
            )
        except services.errors.document.DocumentNameDuplicateError:
            raise DocumentNameDuplicateError()

        return marshal(dataset, belink_document_detail_fields), 201

api.add_resource(DocumentListApi, "/documents")
