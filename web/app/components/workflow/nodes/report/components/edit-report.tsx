'use client'
import { useBoolean } from 'ahooks'
import type { FC } from 'react'
import React, { useCallback } from 'react'
import { RiEdit2Line } from '@remixicon/react'
import EditReport from '@/app/components/app/configuration/report-config/edit-report'
import type { Report } from '@/models/reports'

type Props = {
  nodeId: string
  reportId: string
  onChange: (documents: Report[]) => void
}

const AddReport: FC<Props> = ({
  nodeId,
  reportId,
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
      <div 
        className="cursor-pointer select-none rounded-md p-1 hover:bg-state-base-hover" 
        onClick={showModal}>
        <RiEdit2Line className='h-4 w-4 text-text-tertiary' />
      </div>
      {isShowModal && (
        <EditReport
          nodeId={nodeId}
          isShow={isShowModal}
          onClose={hideModal}
          reportId={reportId}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}
export default React.memo(AddReport)
