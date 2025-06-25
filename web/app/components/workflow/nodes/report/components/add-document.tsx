'use client'
import { useBoolean } from 'ahooks'
import type { FC } from 'react'
import React, { useCallback } from 'react'
import AddButton from '@/app/components/base/button/add-button'
import SelectDocument from '@/app/components/app/configuration/document-config/select-document'
import type { Document } from '@/models/documents'

type Props = {
  selectedIds: string[]
  onChange: (documents: Document[]) => void
}

const AddDocument: FC<Props> = ({
  selectedIds,
  onChange,
}) => {
  const [isShowModal, {
    setTrue: showModal,
    setFalse: hideModal,
  }] = useBoolean(false)

  const handleSelect = useCallback((documents: Document[]) => {
    onChange(documents)
    hideModal()
  }, [onChange, hideModal])
  return (
    <div>
      <AddButton onClick={showModal} />
      {isShowModal && (
        <SelectDocument
          isShow={isShowModal}
          onClose={hideModal}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}
export default React.memo(AddDocument)
