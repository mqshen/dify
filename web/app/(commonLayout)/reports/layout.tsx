'use client'

import Loading from '@/app/components/base/loading'
import { useAppContext } from '@/context/app-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DatasetsLayout({ children }: { children: React.ReactNode }) {
  const { isCurrentWorkspaceEditor, isCurrentWorkspaceDatasetOperator, currentWorkspace, isLoadingCurrentWorkspace } = useAppContext()
  const router = useRouter()

  useEffect(() => {
    if (isLoadingCurrentWorkspace || !currentWorkspace.id)
      return
    if (!(isCurrentWorkspaceEditor || isCurrentWorkspaceDatasetOperator))
      router.replace('/apps')
  }, [isCurrentWorkspaceEditor, isCurrentWorkspaceDatasetOperator, isLoadingCurrentWorkspace, currentWorkspace, router])

  if (isLoadingCurrentWorkspace || !(isCurrentWorkspaceEditor || isCurrentWorkspaceDatasetOperator))
    return <Loading type='app' />
  return (
    <div>
      {children}
    </div>
  )
}
