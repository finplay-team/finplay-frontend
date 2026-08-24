// "N번째 연습" 줄 바로 아래에서 항상 펼쳐 보여주는 학습 단계 진행 표시
import type { Market } from '../../services/types'
import { phaseText, type TutorialPhase } from './tutorialPhase'

/**
 * 화면 표시 순서. `tutorialPhase.ts`가 말하듯 `PLAN`↔`WATCH`는 손절·익절마다 되풀이되므로
 * 이 목록은 "지나온 순서"가 아니라 "국면의 종류"만 나열한다 — 그래서 지난 칸을 완료로 칠하지 않고
 * 지금 칸만 강조한다.
 *
 * 접었다 펴는 토글이었다가(2026-08-24 1차) 늘 펼쳐 두고 더 크고 또렷하게 바꿨다 — 접혀 있으면
 * 지금 어디에 있는지를 매번 한 번 더 눌러야 확인할 수 있어, 상단에서 가장 먼저 읽히는 자리에
 * 걸맞지 않았다(2026-08-24 2차 피드백).
 */
const PHASES: TutorialPhase[] = ['SELECT', 'ORDER_BASICS', 'PLAN', 'WATCH', 'REVIEW']

export function TutorialPhaseProgress({ market, phase }: { market: Market; phase: TutorialPhase }) {
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-2" aria-label="학습 단계">
      {PHASES.map((value, index) => {
        const current = value === phase
        // holding은 표시용 이름(title)에 영향을 주지 않는다 — todo만 holding에 따라 달라진다.
        const label = phaseText(value, { market, holding: false }).title
        return (
          <li key={value} className="flex items-center gap-2">
            {index > 0 && <span className="text-line" aria-hidden>›</span>}
            <span
              aria-current={current ? 'step' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                current ? 'bg-brand text-brand-ink' : 'bg-elevated text-muted'
              }`}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
