import type { Fetcher } from 'swr'
import { get } from './base'
import type { ReportTemplateResponse, Report } from '@/models/reports'

export const fetchReportTemplate = () => {
  return get<ReportTemplateResponse>('reports/template')
}

export const fetchReportDetail: Fetcher<Report, string> = (reportId: string) => {
  return get<Report>(`/reports/${reportId}`)
}