'use client'
import type { FC } from 'react'
import React, { useCallback, useState } from 'react'
import { useBoolean } from 'ahooks'
import {
  RiDeleteBinLine,
  RiEditLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import type { Report } from '@/models/reports'
import ActionButton, { ActionButtonState } from '@/app/components/base/action-button'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import { useKnowledge } from '@/hooks/use-knowledge'

type Props = {
  payload: Report
  onRemove: () => void
  onChange: (report: Report) => void
  readonly?: boolean
  editable?: boolean
}

const DatasetItem: FC<Props> = ({
  payload,
  onRemove,
  onChange,
  readonly,
  editable = true,
}) => {
  const media = useBreakpoints()
  const { t } = useTranslation()
  const isMobile = media === MediaType.mobile
  const { formatIndexingTechniqueAndMethod } = useKnowledge()
  const [isDeleteHovered, setIsDeleteHovered] = useState(false)

  const [isShowSettingsModal, {
    setTrue: showSettingsModal,
    setFalse: hideSettingsModal,
  }] = useBoolean(false)

  const handleSave = useCallback((newReport: Report) => {
    onChange(newReport)
    hideSettingsModal()
  }, [hideSettingsModal, onChange])

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }, [onRemove])

  return (
    <div className={`group/dataset-item flex h-10 cursor-pointer items-center justify-between rounded-lg
      border-[0.5px] border-components-panel-border-subtle px-2
      ${isDeleteHovered
      ? 'border-state-destructive-border bg-state-destructive-hover'
      : 'bg-components-panel-on-panel-item-bg hover:bg-components-panel-on-panel-item-bg-hover'
    }`}>
      <div className='flex w-0 grow items-center space-x-1.5'>
        <div className='system-sm-medium w-0 grow truncate text-text-secondary'>{payload.name}</div>
      </div>
      {!readonly && (
        <div className='ml-2 hidden shrink-0 items-center  space-x-1 group-hover/dataset-item:flex'>
          {
            editable && <ActionButton
              onClick={(e) => {
                e.stopPropagation()
                showSettingsModal()
              }}
            >
              <RiEditLine className='h-4 w-4 shrink-0 text-text-tertiary' />
            </ActionButton>
          }
          <ActionButton
            onClick={handleRemove}
            state={isDeleteHovered ? ActionButtonState.Destructive : ActionButtonState.Default}
            onMouseEnter={() => setIsDeleteHovered(true)}
            onMouseLeave={() => setIsDeleteHovered(false)}
          >
            <RiDeleteBinLine className={`h-4 w-4 shrink-0 ${isDeleteHovered ? 'text-text-destructive' : 'text-text-tertiary'}`} />
          </ActionButton>
        </div>
      )}

    </div>
  )
}
export default React.memo(DatasetItem)
