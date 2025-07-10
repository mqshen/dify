'use client'

import type { FC } from 'react'
import React from 'react'
import ReportDialog from './report-dialog'
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
  const handleChange = (key: string) => {
  };

  return (
    <ReportDialog
      show={isShow}
      onClose={onClose}
    >
      <ReportUpdateForm nodeId={nodeId} onAddVariable={onAddVariable} onCancel={onClose}/>
    </ReportDialog>
  )
}
export default React.memo(SelectReport)
