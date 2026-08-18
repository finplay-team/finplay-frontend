// 섹션 제목 위에 놓이는 마이크로 pill 배지 (eyebrow 태그)
import type { ReactNode } from 'react'

export function Eyebrow({
  children,
  dot = true,
  dotClassName = 'bg-brand',
}: {
  children: ReactNode
  dot?: boolean
  /** 기본은 민트(bg-brand) — 화면별로 다른 액센트가 필요하면 넘겨서 덮어쓴다. */
  dotClassName?: string
}) {
  return (
    <span className="eyebrow">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />}
      {children}
    </span>
  )
}
