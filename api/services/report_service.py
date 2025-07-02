from typing import Optional

from sqlalchemy import select

from extensions.ext_database import db
from models.report import (
    Report,
)


class ReportService:
    @staticmethod
    def get_reports(page, per_page, tenant_id=None, user=None, search=None, tag_ids=None, include_all=False):
        query = select(Report).filter(Report.tenant_id == tenant_id).order_by(Report.created_at.desc())

        if search:
            query = query.filter(Report.name.ilike(f"%{search}%"))


        reports = db.paginate(select=query, page=page, per_page=per_page, max_per_page=100, error_out=False)

        return reports.items, reports.total

    @staticmethod
    def get_reports_by_ids(ids, tenant_id):
        stmt = select(Report).filter(Report.id.in_(ids), Report.tenant_id == tenant_id)

        reports = db.paginate(select=stmt, page=1, per_page=len(ids), max_per_page=len(ids), error_out=False)

        return reports.items, reports.total

    @classmethod
    def create_empty_report(cls, tenant_id, user_id, name, url):
        report = Report(name=name)
        report.url = url
        report.created_by = user_id
        report.updated_by = user_id
        report.tenant_id = tenant_id
        db.session.add(report)
        db.session.commit()

    @classmethod
    def get_report(cls, report_id) -> Optional[Report]:
        report: Optional[Report] = db.session.query(Report).filter_by(id=report_id).first()
        return report
