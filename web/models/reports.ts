

export type ReportTemplateResponse = {
  version_key: string
  url: string
}

export type Report = {
  id: string
  name: string
  url: string
}

export type ReportListResponse = {
  data: Report[]
  has_more: boolean
  limit: number
  page: number
  total: number
}

export type FetchReportsParams = {
  url: string
  params: {
    page: number
    ids?: string[]
    tag_ids?: string[]
    limit?: number
    include_all?: boolean
    keyword?: string
  }
}