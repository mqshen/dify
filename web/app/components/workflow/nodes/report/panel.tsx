import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import RemoveEffectVarConfirm from '../_base/components/remove-effect-var-confirm'
import useConfig from './use-config'
import AddDocument from './components/add-document'
import type { ReportNodeType } from './types'
import OutputVarList from '@/app/components/workflow/nodes/_base/components/variable/output-var-list'
import AddButton from '@/app/components/base/button/add-button'
import Field from '@/app/components/workflow/nodes/_base/components/field'
import Split from '@/app/components/workflow/nodes/_base/components/split'
import DocumentList from './components/document-list'
import type { NodePanelProps } from '@/app/components/workflow/types'
const i18nPrefix = 'workflow.nodes.code'

const Panel: FC<NodePanelProps<ReportNodeType>> = ({
  id,
  data,
}) => {
  const { t } = useTranslation()

  const {
    readOnly,
    inputs,
    outputKeyOrders,
    selectedDocuments,
    handleOnDocumentsChange,
    handleRemoveVariable,
    handleVarsChange,
    handleAddOutputVariable,
    isShowRemoveVarConfirm,
    hideRemoveVarConfirm,
    onRemoveVarConfirm,
  } = useConfig(id, data)

  return (
    <div className='mt-2'>
      <div className='space-y-4 px-4 pb-4'>
        <Field
          title={t(`${i18nPrefix}.knowledge`)}
          required

          operations={
            <div className='flex items-center space-x-1'>
              {!readOnly && (
                <AddDocument
                  selectedIds={inputs.document_ids}
                  onChange={handleOnDocumentsChange}
                />
              )}
            </div>
          }
        >
          <DocumentList
            list={selectedDocuments}
            onChange={handleOnDocumentsChange}
            readonly={readOnly}
          />
        </Field>
      </div>
      <Split />
      <div className='px-4 pb-2 pt-4'>
        <Field
          title={t(`${i18nPrefix}.outputVars`)}
          operations={
            <AddButton onClick={handleAddOutputVariable} />
          }
          required
        >
          <OutputVarList
            readonly={readOnly}
            outputs={inputs.outputs}
            outputKeyOrders={outputKeyOrders}
            onChange={handleVarsChange}
            onRemove={handleRemoveVariable}
          />
        </Field>
      </div>
      <RemoveEffectVarConfirm
        isShow={isShowRemoveVarConfirm}
        onCancel={hideRemoveVarConfirm}
        onConfirm={onRemoveVarConfirm}
      />
    </div >
  )
}

export default React.memo(Panel)
