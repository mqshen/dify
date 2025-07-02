import type { FC } from 'react'
import React from 'react'

export type IReportDetail = {
  children: React.ReactNode
}

const AppDetail: FC<IReportDetail> = ({ children }) => {
  return (
    <>
      {children}
    </>
  )
}

export default React.memo(AppDetail)
