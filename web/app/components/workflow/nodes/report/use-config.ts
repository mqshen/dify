import { useCallback, useEffect, useRef, useState } from 'react'
import produce from 'immer'
import useOutputVarList from '../_base/hooks/use-output-var-list'
import type { ReportNodeType } from './types'
import useNodeCrud from '@/app/components/workflow/nodes/_base/hooks/use-node-crud'
import type { Document } from '@/models/documents'
import { fetchDocuments } from '@/service/documents'
import { useStore as useAppStore } from '@/app/components/app/store'
import {
  useNodesReadOnly,
} from '@/app/components/workflow/hooks'

const useConfig = (id: string, payload: ReportNodeType) => {
  const { nodesReadOnly: readOnly } = useNodesReadOnly()
  const { inputs, setInputs } = useNodeCrud<ReportNodeType>(id, payload)

  const inputRef = useRef(inputs)

  const appId = useAppStore.getState().appDetail?.id

  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])
  const [selectedDocumentsLoaded, setSelectedDocumentsLoaded] = useState(false)
  useEffect(() => {
    (async () => {
      const inputs = inputRef.current
      const documentIds = inputs.document_ids
      if (documentIds?.length > 0) {
        const { data: dataSetsWithDetail } = await fetchDocuments({ url: '/documents', params: { page: 1, ids: documentIds } as any })
        setSelectedDocuments(dataSetsWithDetail)
      }
      const newInputs = produce(inputs, (draft) => {
        draft.document_ids = documentIds
      })
      setInputs(newInputs)
      setSelectedDocumentsLoaded(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOnDocumentsChange = useCallback((newDocuments: Document[]) => {
    const newInputs = produce(inputs, (draft) => {
      draft.document_ids = newDocuments.map(d => d.id)
    })
    setInputs(newInputs)
  }, [inputs, setInputs])

  const [outputKeyOrders, setOutputKeyOrders] = useState<string[]>([])

  const {
    handleVarsChange,
    handleAddVariable: handleAddOutputVariable,
    handleRemoveVariable,
    isShowRemoveVarConfirm,
    hideRemoveVarConfirm,
    onRemoveVarConfirm,
  } = useOutputVarList<ReportNodeType>({
    id,
    inputs,
    setInputs,
    outputKeyOrders,
    onOutputKeyOrdersChange: setOutputKeyOrders,
  })

  return {
    readOnly,
    inputs,
    selectedDocuments,
    selectedDocumentsLoaded,
    outputKeyOrders,
    handleRemoveVariable,
    isShowRemoveVarConfirm,
    hideRemoveVarConfirm,
    onRemoveVarConfirm,
  }
}

export default useConfig
