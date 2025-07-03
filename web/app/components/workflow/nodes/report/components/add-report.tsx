'use client'
import { useBoolean } from 'ahooks'
import type { FC } from 'react'
import React, { useCallback } from 'react'
import AddButton from '@/app/components/base/button/add-button'
import SelectReport from '@/app/components/app/configuration/report-config/select-report'
import type { Report } from '@/models/reports'

type Props = {
  selectedIds: string[]
  onChange: (documents: Report[]) => void
}

const AddReport: FC<Props> = ({
  selectedIds,
  onChange,
}) => {
  const [isShowModal, {
    setTrue: showModal,
    setFalse: hideModal,
  }] = useBoolean(false)

  const handleSelect = useCallback((reports: Report[]) => {
    onChange(reports)
    hideModal()
  }, [onChange, hideModal])
  return (
    <div>
      <AddButton onClick={showModal} />
      {isShowModal && (
        <SelectReport
          isShow={isShowModal}
          onClose={hideModal}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}
export default React.memo(AddReport)
