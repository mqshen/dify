'use client'
import type { FC } from 'react'
import React, { useRef, useState } from 'react'
import { useGetState, useInfiniteScroll } from 'ahooks'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import produce from 'immer'
import TypeIcon from '../type-icon'
import Modal from '@/app/components/base/modal'
import type { Document } from '@/models/documents'
import Button from '@/app/components/base/button'
import { fetchDocuments } from '@/service/documents'
import Loading from '@/app/components/base/loading'
import cn from '@/utils/classnames'
import { basePath } from '@/utils/var'

export type ISelectDocumentProps = {
  isShow: boolean
  onClose: () => void
  selectedIds: string[]
  onSelect: (document: Document[]) => void
}

const SelectDataSet: FC<ISelectDocumentProps> = ({
  isShow,
  onClose,
  selectedIds,
  onSelect,
}) => {
  const { t } = useTranslation()
  const [selected, setSelected] = React.useState<Document[]>(selectedIds.map(id => ({ id }) as any))
  const [loaded, setLoaded] = React.useState(false)
  const [documents, setDocuments] = React.useState<Document[] | null>(null)
  const hasNoData = !documents || documents?.length === 0
  const canSelectMulti = true

  const listRef = useRef<HTMLDivElement>(null)
  const [page, setPage, getPage] = useGetState(1)
  const [isNoMore, setIsNoMore] = useState(false)

  useInfiniteScroll(
    async () => {
      if (!isNoMore) {
        const { data, has_more } = await fetchDocuments({ url: '/documents', params: { page } })
        setPage(getPage() + 1)
        setIsNoMore(!has_more)
        const newList = [...(documents || []), ...data]// .filter(item => item.indexing_technique || item.provider === 'external')]
        setDocuments(newList)
        setLoaded(true)
        if (!selected.find(item => !item.name))
          return { list: [] }

        const newSelected = produce(selected, (draft) => {
          selected.forEach((item, index) => {
            if (!item.name) { // not fetched database
              const newItem = newList.find(i => i.id === item.id)
              if (newItem)
                draft[index] = newItem
            }
          })
        })
        setSelected(newSelected)
      }
      return { list: [] }
    },
    {
      target: listRef,
      isNoMore: () => {
        return isNoMore
      },
      reloadDeps: [isNoMore],
    },
  )

  const toggleSelect = (document: Document) => {
    const isSelected = selected.some(item => item.id === document.id)
    if (isSelected) {
      setSelected(selected.filter(item => item.id !== document.id))
    }
    else {
      if (canSelectMulti)
        setSelected([...selected, document])
      else
        setSelected([document])
    }
  }

  const handleSelect = () => {
    onSelect(selected)
  }
  return (
    <Modal
      isShow={isShow}
      onClose={onClose}
      className='w-[400px]'
      title={t('appDebug.feature.document.selectTitle')}
    >
      {!loaded && (
        <div className='flex h-[200px]'>
          <Loading type='area' />
        </div>
      )}

      {(loaded && hasNoData) && (
        <div className='mt-6 flex h-[128px] items-center justify-center space-x-1  rounded-lg border text-[13px]'
          style={{
            background: 'rgba(0, 0, 0, 0.02)',
            borderColor: 'rgba(0, 0, 0, 0.02',
          }}
        >
          <span className='text-text-tertiary'>{t('appDebug.feature.document.noDocument')}</span>
          <Link href={`${basePath}/document/create`} className='font-normal text-text-accent'>{t('appDebug.feature.document.toCreate')}</Link>
        </div>
      )}

      {documents && documents?.length > 0 && (
        <>
          <div ref={listRef} className='mt-7 max-h-[286px] space-y-1 overflow-y-auto'>
            {documents.map(item => (
              <div
                key={item.id}
                className={cn(
                  'flex h-10 cursor-pointer items-center justify-between rounded-lg border-[0.5px] border-components-panel-border-subtle bg-components-panel-on-panel-item-bg px-2 shadow-xs hover:border-components-panel-border hover:bg-components-panel-on-panel-item-bg-hover hover:shadow-sm',
                  selected.some(i => i.id === item.id) && 'border-[1.5px] border-components-option-card-option-selected-border bg-state-accent-hover shadow-xs hover:border-components-option-card-option-selected-border hover:bg-state-accent-hover hover:shadow-xs',
                )}
                onClick={() => {
                  toggleSelect(item)
                }}
              >
                <div className='mr-1 flex items-center overflow-hidden'>
                  <div className={cn('mr-2')}>
                    <TypeIcon type="upload_file" size='md' />
                  </div>
                  <div className={cn('max-w-[200px] truncate text-[13px] font-medium text-text-secondary')}>{item.name}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {loaded && (
        <div className='mt-8 flex items-center justify-between'>
          <div className='text-sm  font-medium text-text-secondary'>
            {selected.length > 0 && `${selected.length} ${t('appDebug.feature.dataSet.selected')}`}
          </div>
          <div className='flex space-x-2'>
            <Button onClick={onClose}>{t('common.operation.cancel')}</Button>
            <Button variant='primary' onClick={handleSelect} disabled={hasNoData}>{t('common.operation.add')}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
export default React.memo(SelectDataSet)
