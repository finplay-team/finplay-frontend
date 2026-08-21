// 손절·익절로 자동 매도된 그 순간에 뜨는 결과 모달 — 숫자 두 개가 주인공이고 문장은 거든다
import { Button } from '../ui/Button'
import { TutorialModal } from './TutorialModal'
import { formatKRW, formatSignedKRW, pnlTone } from '../../lib/format'
import type { TutorialGoal } from './TutorialGoalRail'

/**
 * **`CompletionCelebration`과 다른 모달인 이유.** 그쪽은 최초 완료 축하·보상 전용이라 이 순간에
 * 재사용하면 아직 안 끝난 연습에 대고 축하하게 된다. 이 모달이 말해야 하는 건 축하가 아니라
 * **"내가 정한 규칙이 방금 나 대신 팔았고, 그게 얼마를 지켜줬다"** 하나다.
 *
 * 그래서 다음은 전부 뺐다 — 진입 순번·주문유형·대본 칩, 매수가·매도가·수량, 기준선 가격, 수익률 %,
 * 수수료 설명, 사건 요약, "실전 거래 시작하기" 링크. 그 정보들은 되돌아보기와 완료 화면에 있다.
 */
export type ExitOutcomeCause = 'STOP_LOSS' | 'TAKE_PROFIT'

export interface ExitOutcome {
  cause: ExitOutcomeCause
  /**
   * 그 진입에 걸려 있던 비율(%). **제목에 들어간다** — "손절선에 닿았다"는 시스템 로그지만
   * "정해 둔 −3% 선에 닿았다"는 사용자가 자기 손으로 정한 숫자라, 규칙이 자기 것임을 말해 준다.
   */
  rate: number
  /** 그 진입의 실현 손익(원). 서버가 아직 계산 전이면 null이라 큰 숫자 자리를 비운다. */
  realizedPnl: number | null
  /** 팔지 않고 들고 있었다면의 평가손익(원). 대본이 없는 실행이면 null. */
  unrealizedPnlIfHeld: number | null
}

function BigNumber({
  label,
  value,
  dashed = false,
}: {
  label: string
  value: number | null
  dashed?: boolean
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 ${
        dashed ? 'border border-dashed border-line' : 'border border-line bg-elevated/60'
      }`}
    >
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-1 tabular text-2xl font-semibold ${value === null ? 'text-muted' : pnlTone(value)}`}>
        {value === null ? '—' : formatSignedKRW(value)}
      </p>
    </div>
  )
}

/**
 * **익절에서는 반사실("규칙이 없었다면")을 이 순간에 보여주지 않는다**(제품 오너 결정, 2026-08-21).
 * `unrealizedPnlIfHeld`는 현재 대본가 기준이라 매 tick 변하는데, 익절 직후는 대본상 더 오르는
 * 구간이라 "안 팔았으면 더 벌었다"가 나와 교훈이 정확히 반대로 간다. 숨기는 게 아니라 **의미를 갖는
 * 시점(대본 4막 급락 이후·완료 화면)으로 미루는 것**이고, 거기서는 `EntryComparison`이 같은 값을 그린다.
 *
 * 손절은 반대다 — 이미 더 떨어지는 중이라 그 시점에 반사실이 유효하고, 두 숫자를 나란히 놓는 것이
 * 이 튜토리얼이 가르치려는 것 자체다.
 */
export function ExitOutcomeModal({
  outcome,
  goals,
  onClose,
  onWriteReview,
}: {
  outcome: ExitOutcome
  goals: TutorialGoal[]
  onClose: () => void
  /** 목표 두 칸을 다 채운 경우의 마무리 경로. 아직 남았으면 쓰이지 않는다. */
  onWriteReview: () => void
}) {
  const stopLoss = outcome.cause === 'STOP_LOSS'
  const allDone = goals.every((goal) => goal.done)
  const remaining = goals.filter((goal) => !goal.done).length

  /**
   * 규칙이 지켜 준 금액. 두 값이 다 있고 **실제로 덜 잃었을 때만** 말한다 — 손절 뒤에 값이 되돌아온
   * 경우에는 이 숫자가 음수가 되는데, 그때 "지켜줬습니다"라고 쓰면 화면이 거짓말을 한다.
   */
  const saved =
    stopLoss && outcome.realizedPnl !== null && outcome.unrealizedPnlIfHeld !== null
      ? outcome.realizedPnl - outcome.unrealizedPnlIfHeld
      : null

  return (
    <TutorialModal
      eyebrow="자동 매도"
      title={
        stopLoss
          ? `정해 둔 −${outcome.rate}% 선에 닿아 규칙이 대신 팔았습니다`
          : `정해 둔 +${outcome.rate}% 선에 닿아 규칙이 대신 팔았습니다`
      }
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
      <div className={stopLoss ? 'grid gap-3 sm:grid-cols-2' : ''}>
        <BigNumber label="내 결과" value={outcome.realizedPnl} />
        {stopLoss && <BigNumber label="규칙이 없었다면" value={outcome.unrealizedPnlIfHeld} dashed />}
      </div>

      {/*
        제목이 "규칙이 무엇을 했는가"를 말했으니 이 줄은 **그때 사용자가 무엇을 하지 않았는가**를
        말한다 — 이 튜토리얼이 가르치려는 것이 정확히 그 한 순간이다(2026-08-21 튜터 피드백).
      */}
      <p className="mt-3 text-sm leading-relaxed text-ink">
        {stopLoss && saved !== null && saved > 0
          ? `당신이 판단하지 않는 사이 ${formatKRW(saved)}을 지켜줬습니다.`
          : '그 순간 당신은 판단하지 않았습니다.'}
      </p>

      {/* 상단 목표 줄(`TutorialGoalRail`)과 같은 이름을 쓰면 같은 이름의 영역이 화면에 둘이 된다. */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="목표 진행">
        {goals.map((goal) => (
          <span
            key={goal.label}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              goal.done ? 'border-gain/40 bg-gain/10 text-gain' : 'border-line bg-elevated text-muted'
            }`}
          >
            {goal.done ? '✓ ' : ''}
            {goal.label}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {allDone ? '둘 다 채웠습니다.' : remaining === 1 ? '하나 남았습니다.' : '둘 다 남았습니다.'}
      </p>

      <Button
        type="button"
        className="mt-5 w-full"
        onClick={allDone ? onWriteReview : onClose}
      >
        {allDone ? '되돌아보기 쓰기' : '확인했습니다'}
      </Button>
    </TutorialModal>
  )
}
