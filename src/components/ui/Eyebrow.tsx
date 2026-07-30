// 섹션 제목 위에 놓이는 마이크로 pill 배지 (eyebrow 태그)
import type { ReactNode } from 'react'

export function Eyebrow({ children, dot = true }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="eyebrow">
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
      {children}
    </span>
  )
}
