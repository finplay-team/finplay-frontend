// 게시글 본문 속 URL을 도메인 미리보기 카드로 보여준다 — content 에 URL이 없으면 아무 것도 그리지 않는다
import { extractLinkPreview } from '../../lib/linkPreview'
import { LinkIcon } from '../ui/icons'

interface Props {
  content: string
  className?: string
  /** 목록 미리보기용 축소 표시. TradeShareCard 의 compact 와 같은 규칙. */
  compact?: boolean
  /** 카드가 놓이는 배경과 대비되는 배경색 — surface 위에서는 elevated, elevated 위에서는 surface. */
  background?: 'surface' | 'elevated'
}

export function LinkPreviewCard({
  content,
  className = '',
  compact = false,
  background = 'surface',
}: Props) {
  const link = extractLinkPreview(content)
  if (!link) return null

  const iconBoxSize = compact ? 'h-6 w-6' : 'h-7 w-7'
  const iconSize = compact ? 13 : 15
  const gap = compact ? 'gap-2' : 'gap-2.5'
  const padding = compact ? 'px-3 py-2' : 'px-4 py-3'
  const rounded = compact ? 'rounded-lg' : 'rounded-xl'
  const textSize = compact ? 'text-xs' : 'text-sm'
  const bg = background === 'elevated' ? 'bg-elevated' : 'bg-surface'

  return (
    <div className={`flex items-center ${gap} ${rounded} border border-line ${bg} ${padding} ${className}`}>
      <span
        className={`flex ${iconBoxSize} shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted`}
      >
        <LinkIcon width={iconSize} height={iconSize} />
      </span>
      <span className={`truncate ${textSize} text-muted`}>{link.host}</span>
    </div>
  )
}
