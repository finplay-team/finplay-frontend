// "N번째 연습" 줄 바로 아래에서 늘 보여주는 학습 단계 진행 표시 — 점 다섯 개 + 지금 국면 이름 한 줄
import type { Market } from '../../services/types'
import { phaseText, type TutorialPhase } from './tutorialPhase'

/**
 * 화면 표시 순서. `tutorialPhase.ts`가 말하듯 `PLAN`↔`WATCH`는 손절·익절마다 되풀이되므로
 * 이 목록은 "지나온 순서"가 아니라 "국면의 종류"만 나열한다 — 그래서 지난 칸을 완료로 칠하지 않고
 * 지금 칸만 강조한다.
 *
 * 접었다 펴는 토글이었다가(2026-08-24 1차) 다섯 국면 이름을 전부 알약으로 펼쳐 늘 보여주는
 * 형태로 바꿨다(2026-08-24 2차). 그런데 그 다섯 알약 + 오른쪽 버튼 두 개가 한 줄을 다투면서,
 * 버튼은 줄바꿈 없는 텍스트라 줄지 않고 대신 이 자리가 실측 78px 폭까지 짜부라들어 모바일에서
 * 알약이 세로로 쌓여 읽을 수 없었다(2026-08-24 3차 실사용 보고). 폭을 더 이상 두고 다투지
 * 않도록 점 다섯 개(차지하는 폭이 고정적으로 작다) + 지금 국면 이름 한 줄로 바꾼다 — 화면
 * 폭과 무관하게 항상 같은 모양이라 반응형 분기(lg:hidden 류)로 같은 목록을 두 번 그릴 필요가
 * 없다(그러면 접근성 트리에 국면 다섯 개가 두 벌 생긴다).
 */
const PHASES: TutorialPhase[] = ['SELECT', 'ORDER_BASICS', 'PLAN', 'WATCH', 'REVIEW']

export function TutorialPhaseProgress({ market, phase }: { market: Market; phase: TutorialPhase }) {
  const currentLabel = phaseText(phase, { market, holding: false }).title

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <ol className="flex items-center gap-1.5" aria-label="학습 단계">
        {PHASES.map((value) => {
          const current = value === phase
          // holding은 표시용 이름(title)에 영향을 주지 않는다 — todo만 holding에 따라 달라진다.
          const label = phaseText(value, { market, holding: false }).title
          return (
            <li key={value}>
              <span
                aria-current={current ? 'step' : undefined}
                title={label}
                className={`block rounded-full transition-all ${
                  current ? 'h-2.5 w-6 bg-brand' : 'h-2.5 w-2.5 bg-elevated'
                }`}
              >
                {/* 지금 국면은 오른쪽 문장으로 이미 말하므로 여기서는 다른 국면 이름만 스크린리더에 남긴다. */}
                {!current && <span className="sr-only">{label}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <span className="text-sm font-semibold text-ink">{currentLabel}</span>
    </div>
  )
}
