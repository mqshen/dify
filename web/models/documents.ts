export type Document = {
  id: string
  name: string
  icon: string
}

export type FetchDocumentParams = {
  url: string
  params: {
    page: number
    ids?: string[]
    limit?: number
    include_all?: boolean
    keyword?: string
  }
}

export type DocumentListResponse = {
  data: Document[]
  has_more: boolean
  limit: number
  page: number
  total: number
}
