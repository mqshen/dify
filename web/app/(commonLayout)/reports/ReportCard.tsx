'use client'

import { useContext } from 'use-context-selector'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiMoreFill } from '@remixicon/react'
import cn from '@/utils/classnames'
import Confirm from '@/app/components/base/confirm'
import { ToastContext } from '@/app/components/base/toast'
import { checkIsUsedInApp, deleteDataset } from '@/service/datasets'
import type { Report } from '@/models/reports'
import { Folder } from '@/app/components/base/icons/src/vender/solid/files'
import type { HtmlContentProps } from '@/app/components/base/popover'
import CustomPopover from '@/app/components/base/popover'
import Divider from '@/app/components/base/divider'
import { useAppContext } from '@/context/app-context'

export type ReportCardProps = {
  report: Report
  onSuccess?: () => void
}

const ReportCard = ({
  report,
  onSuccess,
}: ReportCardProps) => {
  const { t } = useTranslation()
  const { notify } = useContext(ToastContext)
  const { push } = useRouter()

  const { isCurrentWorkspaceDatasetOperator } = useAppContext()

  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState<string>('')
  const detectIsUsedByApp = useCallback(async () => {
    try {
      const { is_using: isUsedByApp } = await checkIsUsedInApp(report.id)
      setConfirmMessage(isUsedByApp ? t('report.datasetUsedByApp')! : t('report.deleteDatasetConfirmContent')!)
    }
    catch (e: any) {
      const res = await e.json()
      notify({ type: 'error', message: res?.message || 'Unknown error' })
    }

    setShowConfirmDelete(true)
  }, [report.id, notify, t])
  const onConfirmDelete = useCallback(async () => {
    try {
      await deleteDataset(report.id)
      notify({ type: 'success', message: t('report.datasetDeleted') })
      if (onSuccess)
        onSuccess()
    }
    catch {
    }
    setShowConfirmDelete(false)
  }, [report.id, notify, onSuccess, t])

  const Operations = (props: HtmlContentProps & { showDelete: boolean }) => {
    const onMouseLeave = async () => {
      props.onClose?.()
    }
    const onClickRename = async (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      props.onClick?.()
      e.preventDefault()
      setShowRenameModal(true)
    }
    const onClickDelete = async (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      props.onClick?.()
      e.preventDefault()
      detectIsUsedByApp()
    }
    return (
      <div className="relative w-full py-1" onMouseLeave={onMouseLeave}>
        <div className='mx-1 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 py-[6px] hover:bg-state-base-hover' onClick={onClickRename}>
          <span className='text-sm text-text-secondary'>{t('common.operation.settings')}</span>
        </div>
        {props.showDelete && (
          <>
            <Divider className="!my-1" />
            <div
              className='group mx-1 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 py-[6px] hover:bg-state-destructive-hover'
              onClick={onClickDelete}
            >
              <span className={cn('text-sm text-text-secondary', 'group-hover:text-text-destructive')}>
                {t('common.operation.delete')}
              </span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div
        className='group relative col-span-1 flex min-h-[171px] cursor-pointer flex-col rounded-xl border-[0.5px] border-solid border-components-card-border bg-components-card-bg shadow-sm transition-all duration-200 ease-in-out hover:shadow-lg'
        data-disable-nprogress={true}
        onClick={(e) => {
            push(`/reports/${report.id}`)
        }}
      >
        <div className='flex h-[66px] shrink-0 grow-0 items-center gap-3 px-[14px] pb-3 pt-[14px]'>
          <div className={cn(
            'flex shrink-0 items-center justify-center rounded-md border-[0.5px] border-[#E0EAFF] bg-[#F5F8FF] p-2.5',
          )}>
            <Folder className='h-5 w-5 text-[#444CE7]' />
          </div>
          <div className='w-0 grow py-[1px]'>
            <div className='flex items-center text-sm font-semibold leading-5 text-text-secondary'>
              <div className={cn('truncate')} title={report.name}>{report.name}</div>
            </div>
            <div className='mt-[1px] flex items-center text-xs leading-[18px] text-text-tertiary'>
              <div
                className={cn('truncate', 'opacity-50')}
              >
              </div>
            </div>
          </div>
        </div>
        <div className={cn(
          'mt-4 h-[42px] shrink-0 items-center pb-[6px] pl-[14px] pr-[6px] pt-1',
          '!hidden group-hover:!flex',
        )}>
          <div className='mx-1 !hidden h-[14px] w-[1px] shrink-0 bg-divider-regular group-hover:!flex' />
          <div className='!hidden shrink-0 group-hover:!flex'>
            <CustomPopover
              htmlContent={<Operations showDelete={!isCurrentWorkspaceDatasetOperator} />}
              position="br"
              trigger="click"
              btnElement={
                <div
                  className='flex h-8 w-8 cursor-pointer items-center justify-center rounded-md'
                >
                  <RiMoreFill className='h-4 w-4 text-text-secondary' />
                </div>
              }
              btnClassName={open =>
                cn(
                  open ? '!bg-black/5 !shadow-none' : '!bg-transparent',
                  'h-8 w-8 rounded-md border-none !p-2 hover:!bg-black/5',
                )
              }
              className={'!z-20 h-fit !w-[128px]'}
            />
          </div>
        </div>
      </div>
      {showConfirmDelete && (
        <Confirm
          title={t('report.deleteDatasetConfirmTitle')}
          content={confirmMessage}
          isShow={showConfirmDelete}
          onConfirm={onConfirmDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </>
  )
}

export default ReportCard
