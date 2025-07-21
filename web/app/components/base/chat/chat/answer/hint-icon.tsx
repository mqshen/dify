import { useEffect, useRef, useState } from 'react'

type ChunkInfo = {
  id: string
  content: string
  document_name: string
  score: number
}

type HintIconProps = {
  'data-chunk-ids'?: string
  'data-chunks'?: string
  'children'?: React.ReactNode
}

const HintIcon: React.FC<HintIconProps> = ({ 'data-chunks': chunksData }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // 解析chunks数据
  let chunks: ChunkInfo[] = []
  if (chunksData) {
    try {
      // 先进行HTML反转义
      const unescapedData = chunksData
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
      chunks = JSON.parse(unescapedData)
    }
 catch (e) {
      console.error('解析chunk数据失败:', e)
    }
  }

  // 清除隐藏定时器
  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  // 处理图标鼠标进入
  const handleIconMouseEnter = () => {
    clearHideTimeout()
    setShowTooltip(true)
  }

  // 处理图标鼠标离开
  const handleIconMouseLeave = () => {
    // 延迟300ms关闭，给用户时间移动到tooltip上
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTooltip)
        setShowTooltip(false)
    }, 300)
  }

  // 处理tooltip鼠标进入
  const handleTooltipMouseEnter = () => {
    clearHideTimeout()
    setIsHoveringTooltip(true)
  }

  // 处理tooltip鼠标离开
  const handleTooltipMouseLeave = () => {
    setIsHoveringTooltip(false)
    setShowTooltip(false)
  }

  // 处理关闭按钮点击
  const handleClose = () => {
    setShowTooltip(false)
    setIsHoveringTooltip(false)
  }

  // 清理定时器
  useEffect(() => {
    return () => {
      clearHideTimeout()
    }
  }, [])

  return (
    <span className="relative inline-block">
      <span
        ref={iconRef}
        className="hint-icon ml-1 inline-block cursor-pointer select-none text-blue-500 transition-colors duration-200 hover:text-blue-600"
        onMouseEnter={handleIconMouseEnter}
        onMouseLeave={handleIconMouseLeave}
      >
        💡
      </span>

      {showTooltip && chunks.length > 0 && (
        <div
          ref={tooltipRef}
          className="hint-tooltip absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg border border-gray-600 bg-gray-800 p-3 text-sm text-white shadow-lg"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          style={{ pointerEvents: 'auto' }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center text-gray-400 transition-colors duration-200 hover:text-white"
            aria-label="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          <div className="max-h-96 overflow-y-auto pr-4">
            {chunks.map((chunk, idx) => (
              <div key={`${chunk.id}-${idx}`} className={idx > 0 ? 'mt-3 border-t border-gray-600 pt-3' : ''}>
                <div className="mb-1 break-words font-semibold text-blue-300">
                  📄 {chunk.document_name}
                </div>
                <div className="break-words text-xs leading-relaxed text-gray-200">
                  {chunk.content}...
                </div>
              </div>
            ))}
          </div>
          <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></span>
        </div>
      )}
    </span>
  )
}

export default HintIcon
