// 주문 컬럼 최상단의 "지금 배우는 것" 한 줄 — 국면 이름과 그 아래 할 일 한 줄만 남긴다
import type { ReactNode } from 'react'

/**
 * 이 카드가 주문 폼 바로 위 **첫 번째 블록**이다. 예전에는 이 자리를 끝난 일(고르기 완료 줄·체크리스트)이
 * 차지하고 있어서, 지금 무엇을 해야 하는지가 화면에서 두 번째·세 번째로 밀렸다.
 *
 * 번호를 쓰지 않는 이유는 `tutorialPhase.ts` 주석에 있다 — 국면이 되풀이되므로 번호로는 셀 수 없다.
 */
export function TutorialPhaseCard({
  title,
  todo,
  children,
}: {
  title: string
  todo: string
  /** 그 국면에서만 뜻이 있는 진행 표시(2단계 체크리스트 등). 없으면 넣지 않는다. */
  children?: ReactNode
}) {
  return (
    <section
      aria-label="지금 배우는 것"
      className="rounded-2xl border border-line bg-elevated/60 px-4 py-3"
    >
      <p className="text-[11px] font-medium tracking-eyebrow text-muted">지금 배우는 것</p>
      <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{todo}</p>
      {children && <div className="mt-2.5">{children}</div>}
    </section>
  )
}
