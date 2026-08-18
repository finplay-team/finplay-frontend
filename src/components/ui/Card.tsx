// Double-Bezel(외곽 셸 + 이너 코어) 구조의 프리미엄 카드 컨테이너
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  innerClassName?: string
  /**
   * 좌측 상단 글로우 — 시장별 액센트(brand=민트, coin=코인/앰버).
   * deepTeal 은 모의투자 화면의 주식 쪽에만 쓰는 별도 액센트다(2026-08-18 피드백) — 브랜드 민트와
   * 같은 색상 계열이되 더 어둡고 진해서 화면상 구분은 되면서도 튀지 않는다. 다른 화면의
   * accent="brand" 는 그대로 (밝은) 민트를 쓰므로 여기서 brand 자체를 바꾸지 않는다.
   */
  accent?: 'brand' | 'coin' | 'deepTeal' | 'none'
}

const accentGlow: Record<NonNullable<Props['accent']>, string> = {
  brand: 'before:bg-brand/10',
  coin: 'before:bg-coin/15',
  deepTeal: 'before:bg-[#0D9488]/15',
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
