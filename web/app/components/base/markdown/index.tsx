import ReactMarkdown from 'react-markdown'
import 'katex/dist/katex.min.css'
import RemarkMath from 'remark-math'
import RemarkBreaks from 'remark-breaks'
import RehypeKatex from 'rehype-katex'
import RemarkGfm from 'remark-gfm'
import RehypeRaw from 'rehype-raw'
import { flow } from 'lodash-es'
import cn from '@/utils/classnames'
import { customUrlTransform, preprocessLaTeX, preprocessThinkTag } from './markdown-utils'
import {
  AudioBlock,
  CodeBlock,
  Img,
  Link,
  MarkdownButton,
  MarkdownForm,
  Paragraph,
  ScriptBlock,
  ThinkBlock,
  VideoBlock,
} from '@/app/components/base/markdown-blocks'
import HintIcon from '@/app/components/base/chat/chat/answer/hint-icon'

/**
 * @fileoverview Main Markdown rendering component.
 * This file was refactored to extract individual block renderers and utility functions
 * into separate modules for better organization and maintainability as of [Date of refactor].
 * Further refactoring candidates (custom block components not fitting general categories)
 * are noted in their respective files if applicable.
 */

// 引用提示数据类型定义
type CitationHint = {
  text_range: { start: number; end: number }
  chunk_ids: string[]
  confidence: number
}

type RetrieverResource = {
  segment_id: string
  document_name: string
  content: string
  score: number
  dataset_name?: string
}

// 基于位置信息动态插入引用提示
const processContentWithCitations = (
  text: string,
  hints: CitationHint[] = [],
  retrieverResources: RetrieverResource[] = [],
) => {
  if (!hints?.length)
    return text

  // 创建chunk查找映射
  const chunkMap = new Map(
    retrieverResources.map(resource => [resource.segment_id, resource]),
  )

  // 按位置排序（从后往前处理，避免位置偏移）
  const sortedHints = [...hints].sort((a, b) => b.text_range.start - a.text_range.start)

  let processedText = text
  sortedHints.forEach((hint) => {
    const { start, end } = hint.text_range

    // 从retriever_resources中获取chunk详情
    const chunksData = hint.chunk_ids
      .map(id => chunkMap.get(id))
      .filter(Boolean)

    if (chunksData.length === 0) return // 如果没有找到对应的chunk数据，跳过

    const beforeText = processedText.slice(0, end)
    const afterText = processedText.slice(end)

    // 插入引用提示标记
    const chunksJson = JSON.stringify(chunksData).replace(/"/g, '&quot;')
    processedText = `${beforeText
      } <hint-icon data-chunks="${chunksJson}"></hint-icon>${
      afterText}`
  })

  return processedText
}

export function Markdown(props: {
  content: string;
  className?: string;
  customDisallowedElements?: string[];
  citationHints?: CitationHint[];
  retrieverResources?: RetrieverResource[];
}) {
  const { content, citationHints, retrieverResources } = props

  // 处理引用提示
  const processedContent = processContentWithCitations(content, citationHints, retrieverResources)

  const latexContent = flow([
    preprocessThinkTag,
    preprocessLaTeX,
  ])(processedContent)

  return (
    <div className={cn('markdown-body', '!text-text-primary', props.className)}>
      <ReactMarkdown
        remarkPlugins={[
          RemarkGfm,
          [RemarkMath, { singleDollarTextMath: false }],
          RemarkBreaks,
        ]}
        rehypePlugins={[
          RehypeKatex,
          RehypeRaw as any,
          // The Rehype plug-in is used to remove the ref attribute of an element
          () => {
            return (tree: any) => {
              const iterate = (node: any) => {
                if (node.type === 'element' && node.properties?.ref)
                  delete node.properties.ref

                if (node.type === 'element' && !/^[a-z][a-z0-9-]*$/i.test(node.tagName) && node.tagName !== 'hint-icon') {
                  node.type = 'text'
                  node.value = `<${node.tagName}`
                }

                if (node.children)
                  node.children.forEach(iterate)
              }
              tree.children.forEach(iterate)
            }
          },
        ]}
        urlTransform={customUrlTransform}
        disallowedElements={['iframe', 'head', 'html', 'meta', 'link', 'style', 'body', ...(props.customDisallowedElements || [])].filter(el => el !== 'hint-icon')}
        components={{
          'code': CodeBlock,
          'img': Img,
          'video': VideoBlock,
          'audio': AudioBlock,
          'a': Link,
          'p': Paragraph,
          'button': MarkdownButton,
          'form': MarkdownForm,
          'script': ScriptBlock as any,
          'details': ThinkBlock,
          'hint-icon': HintIcon,
        }}
      >
        {/* Markdown detect has problem. */}
        {latexContent}
      </ReactMarkdown>
    </div>
  )
}
