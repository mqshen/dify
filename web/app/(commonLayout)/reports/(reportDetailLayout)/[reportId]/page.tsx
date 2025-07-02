
"use client"

import React, { useState } from 'react'
import ReportUpdateForm from '@/app/components/reports/create'

type Props = {
  params: { reportId: string }
}

const ReportDetail = (props: Props) => {
  const params = props.params

  const { reportId } = params


  const nodeId = ""
  const handleChange = (key: string) => {
  };
  return (
    <ReportUpdateForm reportId={reportId} nodeId={nodeId} onChange={handleChange} />
  )
}

export default ReportDetail