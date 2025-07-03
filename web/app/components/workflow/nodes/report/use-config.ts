import { useCallback, useEffect, useRef, useState } from 'react'
import produce from 'immer'
import type { ReportNodeType } from './types'
import useNodeCrud from '@/app/components/workflow/nodes/_base/hooks/use-node-crud'
import type { Report } from '@/models/reports'
import { fetchReports } from '@/service/reports'
import { useNodesReadOnly } from '@/app/components/workflow/hooks'

const useConfig = (id: string, payload: ReportNodeType) => {
  const { nodesReadOnly: readOnly } = useNodesReadOnly()
  const { inputs, setInputs: doSetInputs} = useNodeCrud<ReportNodeType>(id, payload)

  const inputRef = useRef(inputs)

  const setInputs = useCallback((s: ReportNodeType) => {
    const newInputs = produce(s, (draft) => {
    })
    // not work in pass to draft...
    doSetInputs(newInputs)
    inputRef.current = newInputs
  }, [doSetInputs])

  const [selectedReports, setSelectedReports] = useState<Report[]>([])
  const [selectedReportsLoaded, setSelectedReportsLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const inputs = inputRef.current
      const reportIds = inputs.report_ids
      if (reportIds?.length > 0) {
        const { data: dataSetsWithDetail } = await fetchReports({ url: '/reports', params: { page: 1, ids: reportIds } as any })
        setSelectedReports(dataSetsWithDetail)
      }
      const newInputs = produce(inputs, (draft) => {
        draft.report_ids = reportIds
      })
      setInputs(newInputs)
      setSelectedReportsLoaded(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOnReportsChange = useCallback((newReports: Report[]) => {
    const newInputs = produce(inputs, (draft) => {
      draft.report_ids = newReports.map(d => d.id)
    })
    console.log("new inputs", newInputs)
    setInputs(newInputs)
  }, [inputs, setInputs])

  const [outputKeyOrders, setOutputKeyOrders] = useState<string[]>([])

  return {
    readOnly,
    inputs,
    selectedReports,
    selectedReportsLoaded,
    handleOnReportsChange,
    outputKeyOrders,
  }
}

export default useConfig
