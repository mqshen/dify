import type { FC } from 'react'
import { memo } from 'react'
import type { ChatItem } from '../../types'
import { Markdown } from '@/app/components/base/markdown'
import cn from '@/utils/classnames'

type BasicContentProps = {
  item: ChatItem
}
const BasicContent: FC<BasicContentProps> = ({
  item,
}) => {
  const {
    annotation,
    content,
  } = item

  if (annotation?.logAnnotation)
    return <Markdown content={annotation?.logAnnotation.content || ''} />

  return (
    <Markdown
      className={cn(
        item.isError && '!text-[#F04438]',
      )}
      content={content}
      citationHints={item.citation_hints}
      retrieverResources={item.citation?.map(citation => ({
        segment_id: citation.segment_id,
        document_name: citation.document_name,
        content: citation.content,
        score: citation.score,
        dataset_name: citation.dataset_name,
      }))}
    />
  )
}

export default memo(BasicContent)
