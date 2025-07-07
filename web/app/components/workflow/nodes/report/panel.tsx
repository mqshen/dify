import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import useConfig from './use-config'
import EditReport from './components/edit-report'
import type { ReportNodeType } from './types'
import Field from '@/app/components/workflow/nodes/_base/components/field'
import Split from '@/app/components/workflow/nodes/_base/components/split'
import OutputVars, { VarItem } from '@/app/components/workflow/nodes/_base/components/output-vars'
import type { NodePanelProps, ValueSelector } from '@/app/components/workflow/types'

const i18nPrefix = 'workflow.nodes.report'

const Panel: FC<NodePanelProps<ReportNodeType>> = ({
  id,
  data,
}) => {
  const { t } = useTranslation()

  const {
    readOnly,
    inputs,
    handleAddVariable,
  } = useConfig(id, data)

  return (
    <div className='mt-2'>
      <div className='space-y-4 px-4 pb-4'>
        {/* <Field
          title={t(`${i18nPrefix}.inputVars`)}
          operations={
            !readOnly ? <AddButton onClick={handleAddVariable} /> : undefined
          }
        >
          <VarList
            readonly={readOnly}
            nodeId={id}
            list={inputs.variables}
            onChange={handleVarListChange}
            isSupportFileVar={false}
          />
        </Field> */}
        <Split />
        <Field
          title={t(`${i18nPrefix}.knowledge`)}
          required
          operations={
            <div className='flex items-center space-x-1'>
              {!readOnly && (
                <EditReport
                  nodeId={id}
                  reportId={inputs.report_id}
                  onAddVariable={handleAddVariable}
                />
              )}
            </div>
          }
        >
        </Field>
      </div>
      <Split />
      <div>
        <OutputVars>
          <>
            <VarItem
              name='result'
              type='Array[Object]'
              description={t(`${i18nPrefix}.outputVars.output`)}
              subItems={[
                {
                  name: 'url',
                  type: 'string',
                  description: t(`${i18nPrefix}.outputVars.url`),
                },
              ]}
            />

          </>
        </OutputVars>
      </div>
    </div >
  )
}

export default React.memo(Panel)
