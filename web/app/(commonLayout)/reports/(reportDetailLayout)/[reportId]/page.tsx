
import React, { useState } from 'react'
import ReportUpdateForm from '@/app/components/reports/create'

type Props = {
  params: Promise<{ reportId: string }>
}

const ReportDetail = async (props: Props) => {
  const params = await props.params

  const { reportId } = params


  const nodeId = ""
  return (
    <ReportUpdateForm reportId={reportId} nodeId={nodeId} />
  )
}

export default ReportDetail