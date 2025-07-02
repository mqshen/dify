'use client'

import { useCallback, useEffect, useRef } from 'react'
import useSWRInfinite from 'swr/infinite'
import { debounce } from 'lodash-es'
import NewReportCard from './NewReportCard'
import ReportCard from './ReportCard'
import type { ReportListResponse, FetchReportsParams } from '@/models/reports'
import { fetchDatasets } from '@/service/datasets'
import { useAppContext } from '@/context/app-context'
import { useTranslation } from 'react-i18next'

const getKey = (
  pageIndex: number,
  previousPageData: ReportListResponse,
  tags: string[],
  keyword: string,
  includeAll: boolean,
) => {
  if (!pageIndex || previousPageData.has_more) {
    const params: FetchReportsParams = {
      url: 'reports',
      params: {
        page: pageIndex + 1,
        limit: 30,
        include_all: includeAll,
      },
    }
    if (tags.length)
      params.params.tag_ids = tags
    if (keyword)
      params.params.keyword = keyword
    return params
  }
  return null
}

type Props = {
  containerRef: React.RefObject<HTMLDivElement>
  tags: string[]
  keywords: string
  includeAll: boolean
}

const Datasets = ({
  containerRef,
  tags,
  keywords,
  includeAll,
}: Props) => {
  const { t } = useTranslation()
  const { isCurrentWorkspaceEditor } = useAppContext()
  const { data, isLoading, setSize, mutate } = useSWRInfinite(
    (pageIndex: number, previousPageData: ReportListResponse) => getKey(pageIndex, previousPageData, tags, keywords, includeAll),
    fetchDatasets,
    { revalidateFirstPage: false, revalidateAll: true },
  )
  const loadingStateRef = useRef(false)
  const anchorRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    loadingStateRef.current = isLoading
  }, [isLoading, t])

  const onScroll = useCallback(
    debounce(() => {
      if (!loadingStateRef.current && containerRef.current && anchorRef.current) {
        const { scrollTop, clientHeight } = containerRef.current
        const anchorOffset = anchorRef.current.offsetTop
        if (anchorOffset - scrollTop - clientHeight < 100)
          setSize(size => size + 1)
      }
    }, 50),
    [setSize],
  )

  useEffect(() => {
    const currentContainer = containerRef.current
    currentContainer?.addEventListener('scroll', onScroll)
    return () => {
      currentContainer?.removeEventListener('scroll', onScroll)
      onScroll.cancel()
    }
  }, [containerRef, onScroll])

  return (
    <nav className='grid shrink-0 grow grid-cols-1 content-start gap-4 px-12 pt-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
      {isCurrentWorkspaceEditor && <NewReportCard ref={anchorRef} />}
      {data?.map(({ data: reports }) => reports.map(report => (
        <ReportCard key={report.id} report={report} onSuccess={mutate} />),
      ))}
    </nav>
  )
}

export default Datasets
