import qs from 'qs'
import type { Fetcher } from 'swr'
import { get } from './base'
import type { ReportTemplateResponse, Report, FetchReportParams, ReportListResponse } from '@/models/reports'

export const fetchReportTemplate = () => {
  return get<ReportTemplateResponse>('reports/template')
}

export const fetchReportDetail: Fetcher<Report, string> = (reportId: string) => {
  return get<Report>(`/reports/${reportId}`)
}

export const fetchReports: Fetcher<ReportListResponse, FetchReportParams> = ({ url, params }) => {
  const urlParams = qs.stringify(params, { indices: false })
  return get<ReportListResponse>(`${url}?${urlParams}`)
}
