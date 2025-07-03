import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import useConfig from './use-config'
import AddReport from './components/add-report'
import type { ReportNodeType } from './types'
import Field from '@/app/components/workflow/nodes/_base/components/field'
import Split from '@/app/components/workflow/nodes/_base/components/split'
import OutputVars, { VarItem } from '@/app/components/workflow/nodes/_base/components/output-vars'
import ReportList from './components/report-list'
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
    selectedReports,
    handleOnReportsChange,
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
                <AddReport
                  selectedIds={inputs.report_ids}
                  onChange={handleOnReportsChange}
                />
              )}
            </div>
          }
        >
          <ReportList
            list={selectedReports}
            onChange={handleOnReportsChange}
            readonly={readOnly}
          />
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
