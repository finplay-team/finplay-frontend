// 자식 요소를 뷰포트 진입 시 fade-up 시키는 래퍼 (useReveal 기반)
import type { ElementType, ReactNode } from 'react'
import { useReveal } from '../../hooks/useReveal'

interface Props {
  children: ReactNode
  as?: ElementType
  className?: string
  /** 스태거 지연 (ms) */
  delay?: number
}

export function Reveal({ children, as, className = '', delay = 0 }: Props) {
  const Tag = (as ?? 'div') as ElementType
  const { ref, visible } = useReveal<HTMLDivElement>()

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
