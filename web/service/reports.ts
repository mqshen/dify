import { get } from './base'
import type { ReportTemplateResponse } from '@/models/reports'

export const fetchReportTemplate = () => {
  return get<ReportTemplateResponse>('reports/template')
}