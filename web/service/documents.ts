import type { Fetcher } from 'swr'
import qs from 'qs'
import { get } from './base'

import type {
  DocumentListResponse,
  FetchDocumentParams,
} from '@/models/documents'

export const fetchDocuments: Fetcher<DocumentListResponse, FetchDocumentParams> = ({ url, params }) => {
  const urlParams = qs.stringify(params, { indices: false })
  return get<DocumentListResponse>(`${url}?${urlParams}`)
}
