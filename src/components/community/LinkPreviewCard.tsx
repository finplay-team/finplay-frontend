// 게시글 본문 속 URL을 도메인 미리보기 카드로 보여준다 — content 에 URL이 없으면 아무 것도 그리지 않는다
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
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
  // 깨진 썸네일(잘못된 영상 id, 삭제된 영상 등)은 조용히 숨긴다 — 어떤 url이 실패했는지 기억해
  // 다른 게시글의 유효한 썸네일까지 함께 숨어버리지 않게 한다.
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  if (!link) return null
  const showThumbnail = link.thumbnailUrl !== null && link.thumbnailUrl !== failedThumbnailUrl

  const iconBoxSize = compact ? 'h-6 w-6' : 'h-7 w-7'
  const iconSize = compact ? 13 : 15
  const gap = compact ? 'gap-2' : 'gap-2.5'
  const padding = compact ? 'px-3 py-2' : 'px-4 py-3'
  const rounded = compact ? 'rounded-lg' : 'rounded-xl'
  const textSize = compact ? 'text-xs' : 'text-sm'
  const bg = background === 'elevated' ? 'bg-elevated' : 'bg-surface'
  const thumbnailHeight = compact ? 'h-24' : 'h-40'

  /**
   * 목록에서는 카드 전체가 게시글 상세로 가는 Link 라서, 이 안에 실제 <a> 를 또 넣으면
   * 앵커 중첩(유효하지 않은 HTML)이 된다. 대신 클릭을 여기서 가로채 새 탭으로 직접 연다.
   */
  const openLink = (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }
  // 실제 <a> 는 Enter 로만 활성화된다 — Space 까지 반응하면 스페이스바로 페이지를 스크롤하려는
  // 키보드 사용자의 동작을 가로채게 된다.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') openLink(e)
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${link.host} 링크 새 탭에서 열기`}
      onClick={openLink}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer overflow-hidden ${rounded} border border-line ${bg} ${className}`}
    >
      <div className={`flex items-center ${gap} ${padding}`}>
        <span
          className={`flex ${iconBoxSize} shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted`}
        >
          <LinkIcon width={iconSize} height={iconSize} />
        </span>
        <span className={`truncate ${textSize} text-muted`}>{link.host}</span>
      </div>
      {/* OG 메타데이터를 가져올 백엔드가 없어 일반 링크는 썸네일이 없다 — 유튜브만 공개 썸네일 경로로 그린다. */}
      {showThumbnail && (
        <img
          src={link.thumbnailUrl ?? undefined}
          alt=""
          onError={() => setFailedThumbnailUrl(link.thumbnailUrl)}
          className={`${thumbnailHeight} w-full border-t border-line object-cover`}
        />
      )}
    </div>
  )
}
