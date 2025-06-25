import type { CommonNodeType, VarType, Variable } from '@/app/components/workflow/types'

export type OutputVar = Record<string, {
  type: VarType
  children: null // support nest in the future,
}>

export type ReportNodeType = CommonNodeType & {
  document_ids: string[]
  variables: Variable[]
  outputs: OutputVar
}
