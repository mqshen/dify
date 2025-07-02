"use client"

import React, { useState } from 'react'
import ReportUpdateForm from '@/app/components/reports/create'

type Props = {}

const ReportCreation = (props: Props) => {
  const nodeId = ""
  const [value, setValue] = useState({
        name:  '',
        key:  ''
    });
  const handleChange = (key: string) => {
  };
  return (
    <ReportUpdateForm nodeId={nodeId} versionKey={value.key} onChange={handleChange} />
  )
}

export default ReportCreation
