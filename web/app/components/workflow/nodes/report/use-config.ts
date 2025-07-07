import { useCallback } from 'react'
import produce from 'immer'
import type { ReportNodeType, } from './types'
import useNodeCrud from '@/app/components/workflow/nodes/_base/hooks/use-node-crud'
import type { ValueSelector } from '@/app/components/workflow/types'
import { useNodesReadOnly } from '@/app/components/workflow/hooks'

const useConfig = (id: string, payload: ReportNodeType) => {
  const { nodesReadOnly: readOnly } = useNodesReadOnly()
  const { inputs, setInputs} = useNodeCrud<ReportNodeType>(id, payload)

  const handleAddVariable = useCallback((varibaleName: string, value_selector: ValueSelector) => {
    const newInputs = produce(inputs, (draft: any) => {
      const variables = draft['variables']
      const currentVariable = variables.find((x: any) => x.variable === varibaleName)
      if (currentVariable) {
        currentVariable.value_selector = value_selector;
      } else {
        variables.push({
          variable: varibaleName,
          value_selector: value_selector,
        })
      }
    })
    setInputs(newInputs)
  }, [inputs, setInputs])

  return {
    readOnly,
    inputs,
    handleAddVariable,
  }
}

export default useConfig
