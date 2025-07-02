'use client'

// Libraries
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useBoolean, useDebounceFn } from 'ahooks'
import { useQuery } from '@tanstack/react-query'

// Components
import Reports from './Reports'
import ReportFooter from './ReportFooter'
import ApiServer from '../../components/develop/ApiServer'
import TabSliderNew from '@/app/components/base/tab-slider-new'
import TagFilter from '@/app/components/base/tag-management/filter'
import Input from '@/app/components/base/input'
import CheckboxWithLabel from '@/app/components/datasets/create/website/base/checkbox-with-label'

// Services
import { fetchDatasetApiBaseUrl } from '@/service/datasets'

// Hooks
import { useTabSearchParams } from '@/hooks/use-tab-searchparams'
import { useAppContext } from '@/context/app-context'
import { useGlobalPublicStore } from '@/context/global-public-context'
import useDocumentTitle from '@/hooks/use-document-title'

const Container = () => {
  const { t } = useTranslation()
  const { systemFeatures } = useGlobalPublicStore()
  const router = useRouter()
  const { currentWorkspace, isCurrentWorkspaceOwner } = useAppContext()
  const [includeAll, { toggle: toggleIncludeAll }] = useBoolean(false)
  useDocumentTitle(t('dataset.knowledge'))

  const options = useMemo(() => {
    return [
      { value: 'report', text: t('report.reports') },
      ...(currentWorkspace.role === 'dataset_operator' ? [] : [{ value: 'api', text: t('dataset.datasetsApi') }]),
    ]
  }, [currentWorkspace.role, t])

  const [activeTab, setActiveTab] = useTabSearchParams({
    defaultTab: 'report',
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const { data } = useQuery(
    {
      queryKey: ['reportApiBaseInfo'],
      queryFn: () => fetchDatasetApiBaseUrl('/reports/api-base-info'),
      enabled: activeTab !== 'report',
    },
  )

  const [keywords, setKeywords] = useState('')
  const [searchKeywords, setSearchKeywords] = useState('')
  const { run: handleSearch } = useDebounceFn(() => {
    setSearchKeywords(keywords)
  }, { wait: 500 })
  const handleKeywordsChange = (value: string) => {
    setKeywords(value)
    handleSearch()
  }
  const [tagFilterValue, setTagFilterValue] = useState<string[]>([])
  const [tagIDs, setTagIDs] = useState<string[]>([])
  const { run: handleTagsUpdate } = useDebounceFn(() => {
    setTagIDs(tagFilterValue)
  }, { wait: 500 })
  const handleTagsChange = (value: string[]) => {
    setTagFilterValue(value)
    handleTagsUpdate()
  }

  useEffect(() => {
    if (currentWorkspace.role === 'normal')
      return router.replace('/apps')
  }, [currentWorkspace, router])

  return (
    <div ref={containerRef} className='scroll-container relative flex grow flex-col overflow-y-auto bg-background-body'>
      <div className='sticky top-0 z-10 flex h-[80px] shrink-0 flex-wrap items-center justify-between gap-y-2 bg-background-body px-12 pb-2 pt-4 leading-[56px]'>
        <TabSliderNew
          value={activeTab}
          onChange={newActiveTab => setActiveTab(newActiveTab)}
          options={options}
        />
        {activeTab === 'reports' && (
          <div className='flex items-center justify-center gap-2'>
            {isCurrentWorkspaceOwner && <CheckboxWithLabel
              isChecked={includeAll}
              onChange={toggleIncludeAll}
              label={t('dataset.allKnowledge')}
              labelClassName='system-md-regular text-text-secondary'
              className='mr-2'
              tooltip={t('dataset.allKnowledgeDescription') as string}
            />}
            <TagFilter type='knowledge' value={tagFilterValue} onChange={handleTagsChange} />
            <Input
              showLeftIcon
              showClearIcon
              wrapperClassName='w-[200px]'
              value={keywords}
              onChange={e => handleKeywordsChange(e.target.value)}
              onClear={() => handleKeywordsChange('')}
            />
            <div className="h-4 w-[1px] bg-divider-regular" />
          </div>
        )}
        {activeTab === 'api' && data && <ApiServer apiBaseUrl={data.api_base_url || ''} />}
      </div>
      {activeTab === 'report' && (
        <>
          <Reports containerRef={containerRef} tags={tagIDs} keywords={searchKeywords} includeAll={includeAll} />
          {!systemFeatures.branding.enabled && <ReportFooter />}
        </>
      )}
      {/* {activeTab === 'api' && data && <Doc apiBaseUrl={data.api_base_url || ''} />} */}

    </div>
  )
}

export default Container
