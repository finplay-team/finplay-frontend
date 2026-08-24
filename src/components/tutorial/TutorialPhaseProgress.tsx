// "N번째 연습" 줄 바로 아래에서 토글로 여닫는 학습 단계 진행 표시 — 접었다 펼 수 있어 평소엔 화면을 덜 차지한다
import { useState } from 'react'
import type { Market } from '../../services/types'
import { phaseText, type TutorialPhase } from './tutorialPhase'

/**
 * 화면 표시 순서. `tutorialPhase.ts`가 말하듯 `PLAN`↔`WATCH`는 손절·익절마다 되풀이되므로
 * 이 목록은 "지나온 순서"가 아니라 "국면의 종류"만 나열한다 — 그래서 지난 칸을 완료로 칠하지 않고
 * 지금 칸만 강조한다.
 */
const PHASES: TutorialPhase[] = ['SELECT', 'ORDER_BASICS', 'PLAN', 'WATCH', 'REVIEW']

export function TutorialPhaseProgress({ market, phase }: { market: Market; phase: TutorialPhase }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="text-[11px] font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {expanded ? '학습 단계 숨기기' : '학습 단계 보기'}
      </button>
      {expanded && (
        <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="학습 단계">
          {PHASES.map((value) => {
            const current = value === phase
            // holding은 표시용 이름(title)에 영향을 주지 않는다 — todo만 holding에 따라 달라진다.
            const label = phaseText(value, { market, holding: false }).title
            return (
              <li key={value}>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    current ? 'border-brand/40 bg-brand/15 text-brand' : 'border-line bg-elevated text-muted'
                  }`}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
