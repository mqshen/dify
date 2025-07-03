'use client'
import type { FC } from 'react'
import React, { useCallback, useMemo } from 'react'
import produce from 'immer'
import { useTranslation } from 'react-i18next'
import Item from './report-item'
import type { Report } from '@/models/reports'
import { useSelector as useAppContextSelector } from '@/context/app-context'
import { hasEditPermissionForDataset } from '@/utils/permission'

type Props = {
  list: Report[]
  onChange: (list: Report[]) => void
  readonly?: boolean
}

const ReportList: FC<Props> = ({
  list,
  onChange,
  readonly,
}) => {
  const { t } = useTranslation()
  const userProfile = useAppContextSelector(s => s.userProfile)

  const handleRemove = useCallback((index: number) => {
    return () => {
      const newList = produce(list, (draft) => {
        draft.splice(index, 1)
      })
      onChange(newList)
    }
  }, [list, onChange])

  const handleChange = useCallback((index: number) => {
    return (value: Report) => {
      const newList = produce(list, (draft) => {
        draft[index] = value
      })
      onChange(newList)
    }
  }, [list, onChange])

  const formattedList = useMemo(() => {
    return list.map((item) => {
      return {
        ...item,
      }
    })
  }, [list, userProfile?.id])

  return (
    <div className='space-y-1'>
      {formattedList.length
        ? formattedList.map((item, index) => {
          return (
            <Item
              key={index}
              payload={item}
              onRemove={handleRemove(index)}
              onChange={handleChange(index)}
              readonly={readonly}
              editable={false}
            />
          )
        })
        : (
          <div className='cursor-default select-none rounded-lg bg-background-section p-3 text-center text-xs text-text-tertiary'>
            {t('appDebug.datasetConfig.knowledgeTip')}
          </div>
        )
      }

    </div>
  )
}
export default React.memo(ReportList)
