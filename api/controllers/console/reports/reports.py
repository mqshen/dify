import requests
from flask import request
from flask_login import current_user
from flask_restful import Resource, marshal, reqparse
from werkzeug.exceptions import Forbidden

import services
from controllers.console import api
from controllers.console.reports.error import DocumentNameDuplicateError
from controllers.console.wraps import (
    account_initialization_required,
    cloud_edition_billing_rate_limit_check,
    setup_required,
)
from extensions.ext_storage import storage
from fields.belink_report_fields import belink_report_detail_fields
from libs.login import login_required
from services.report_service import ReportService


def _validate_name(name):
    if not name or len(name) < 1 or len(name) > 40:
        raise ValueError("Name must be between 1 to 40 characters.")
    return name

class ReportListApi(Resource):
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
            datasets, total = ReportService.get_reports_by_ids(ids, current_user.current_tenant_id)
        else:
            datasets, total = ReportService.get_reports(
                page, limit, current_user.current_tenant_id, current_user, search, tag_ids, include_all
            )

        data = marshal(datasets, belink_report_detail_fields)

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
            report = ReportService.create_empty_report(
                tenant_id=current_user.current_tenant_id,
                name=args["name"],
                content=args["content"],
                account=current_user,
            )
        except services.errors.document.DocumentNameDuplicateError:
            raise DocumentNameDuplicateError()

        return marshal(report, belink_report_detail_fields), 201

class ReportApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    def get(self, report_id):
        report_id_str = str(report_id)
        report = ReportService.get_report(report_id_str)
        return marshal(report, belink_report_detail_fields), 200

class ReportTemplateApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    def get(self):
        response = {"data": {
                "version_key": "111",
                "url": ""
            }
        }
        return response, 200

class ReportCallbackApi(Resource):

    def post(self):
        parser = reqparse.RequestParser()
        parser.add_argument("status", type=int, required=True, location="json")
        parser.add_argument("url", type=str, required=False, nullable=True, location="json")
        parser.add_argument("key", type=str, required=False, nullable=False, location="json")
        parser.add_argument("tenant_id", type=str, required=False, nullable=False, location="json")
        parser.add_argument("dataset_id", type=str, required=False, nullable=False, location="json")
        parser.add_argument(
            "doc_language", type=str, default="English", required=False, nullable=False, location="json"
        )
        args = parser.parse_args()
        print(f"got args {args}")

        status = args['status']
        if status not in {2, 6}:
            # 非保存回调不处理
            return {'error': 0}
        file_url = args['url']
        key = args['key']
        file = requests.get(url=file_url)
        version_key = key.split('_', 1)[0]

        object_name = f"workflow/report/{version_key}.docx"

        print("start upload file")
        try:
            storage.save(object_name, file._content)
        except Exception as e:
            print(f"Unexpected error occurred while upload file to storage {e}")

        ReportService.create_empty_report(
            # tenant_id=args["tenant_id"],
            tenant_id="5275e976-348c-4a0e-9446-91302537f515",
            user_id="1aafaffa-b595-4457-97c6-e0d5b801293b",
            name=key,
            url=object_name,
        )

        return {'error': 0}

api.add_resource(ReportListApi, "/reports")
api.add_resource(ReportApi, "/reports/<uuid:report_id>")
api.add_resource(ReportTemplateApi, "/reports/template")
api.add_resource(ReportCallbackApi, "/reports/callback")
