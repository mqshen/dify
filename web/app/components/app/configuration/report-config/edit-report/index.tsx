'use client'

import type { FC } from 'react'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MenuDialog from '@/app/components/header/account-setting/menu-dialog'
import type { ValueSelector } from '@/app/components/workflow/types'
import ReportUpdateForm from '@/app/components/reports/create'

export type ISelectReportProps = {
  nodeId: string
  isShow: boolean
  onClose: () => void
  onAddVariable: (variableName: string, valueSelector: ValueSelector) => void
}

const SelectReport: FC<ISelectReportProps> = ({
  nodeId,
  isShow,
  onClose,
  onAddVariable,
}) => {
  const { t } = useTranslation()
  const handleChange = (key: string) => {
  };

  return (
    <MenuDialog
      show={isShow}
      onClose={onClose}
    >
      <ReportUpdateForm nodeId={nodeId} onAddVariable={onAddVariable} onCancel={onClose}/>
    </MenuDialog>
  )
}
export default React.memo(SelectReport)
