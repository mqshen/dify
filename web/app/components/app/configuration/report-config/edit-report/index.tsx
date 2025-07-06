'use client'

import type { FC } from 'react'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MenuDialog from '@/app/components/header/account-setting/menu-dialog'
import type { Report } from '@/models/reports'
import ReportUpdateForm from '@/app/components/reports/create'

export type ISelectReportProps = {
  nodeId: string
  isShow: boolean
  onClose: () => void
  reportId: string
  onSelect: (document: Report[]) => void
}

const SelectReport: FC<ISelectReportProps> = ({
  nodeId,
  isShow,
  onClose,
  reportId,
  onSelect,
}) => {
  const { t } = useTranslation()
  const handleChange = (key: string) => {
  };

  return (
    <MenuDialog
      show={isShow}
      onClose={onClose}
      // className='w-full'
      // title={t('appDebug.feature.document.selectTitle')}
    >
      <ReportUpdateForm nodeId={nodeId} reportId={reportId} onCancel={() => {}}/>
    </MenuDialog>
  )
}
export default React.memo(SelectReport)
