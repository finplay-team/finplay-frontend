// 좋아요 여부에 따라 스타일이 바뀌는 하트 버튼 — 목록 카드·상세 화면에서 함께 쓴다
import type { MouseEvent } from 'react'
import { Heart } from '../ui/icons'

interface LikeButtonProps {
  liked: boolean
  count: number
  busy: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}

/** 완전 초보 기준으로 "좋아요 N" 처럼 그대로 읽히게 문구를 쓴다. 하트 아이콘은 상태를 채움 여부로 구분한다. */
export function LikeButton({ liked, count, busy, onClick }: LikeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? '좋아요 취소' : '좋아요'}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 disabled:opacity-40 ${
        liked ? 'bg-brand-soft text-brand' : 'bg-white/[0.04] text-muted hover:text-ink'
      }`}
    >
      <Heart width={14} height={14} fill={liked ? 'currentColor' : 'none'} />
      좋아요 {count.toLocaleString('ko-KR')}
    </button>
  )
}
