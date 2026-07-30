// Double-Bezel(외곽 셸 + 이너 코어) 구조의 프리미엄 카드 컨테이너
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  innerClassName?: string
  /** 좌측 상단 글로우 — 시장별 액센트(brand=주식/민트, coin=코인/앰버) */
  accent?: 'brand' | 'coin' | 'none'
}

const accentGlow: Record<NonNullable<Props['accent']>, string> = {
  brand: 'before:bg-brand/10',
  coin: 'before:bg-coin/15',
  none: 'before:hidden',
}

export function Card({ children, className = '', innerClassName = '', accent = 'none' }: Props) {
  return (
    <div className={`bezel shadow-soft ${className}`}>
      <div
        className={`bezel-core relative overflow-hidden before:pointer-events-none before:absolute before:-left-16 before:-top-16 before:h-40 before:w-40 before:rounded-full before:blur-3xl before:content-[''] ${accentGlow[accent]} ${innerClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
