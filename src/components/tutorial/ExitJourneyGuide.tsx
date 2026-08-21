// 손절·익절을 "어디서 겪는지"를 화면이 계속 말해 주는 진행 안내 (사기 → 예약 걸기 → 기다리기 → 겪기)
import { Button } from '../ui/Button'
import { formatKRW } from '../../lib/format'
import type { ExitExperience } from '../../services/tutorialExitPlan'
import type { PracticeExitPlanSummary } from '../../services/tutorialTypes'

/**
 * 이 컴포넌트가 존재하는 이유는 기능이 아니라 **학습 흐름**이다. 예약을 수동으로 바꾸고 나면 화면에는
 * "예약을 걸 수 있다"는 사실만 남고, 처음 온 사용자는 *왜* 걸어야 하는지·건 뒤에 무엇을 기다리는지·
 * 지금까지 무엇을 겪었는지를 알 수 없다. 제품 오너의 지적("손절을 어디서 겪고 익절을 어디서 겪는지
 * 기준이 없다")이 정확히 그 자리를 가리킨다.
 *
 * **화면을 잠그지 않는다**(강제 강도 b). 안 걸고 그냥 팔아도 되고, 손절만 겪고 나가도 된다 — 다만
 * 그때 무엇을 건너뛰는 중인지는 말해 준다. 침묵과 잠금 사이가 이 컴포넌트의 자리다.
 */
export type ExitJourneyPhase =
  | 'BEFORE_BUY'
  | 'HOLDING_NO_PLAN'
  | 'HOLDING_PLAN_SPENT'
  | 'PLAN_PENDING'
  | 'SOLD_WITHOUT_EXPERIENCE'
  | 'STOP_LOSS_ONLY'
  | 'TAKE_PROFIT_ONLY'
  | 'BOTH'

export interface ExitJourneyInput {
  /** 지금 보유 수량. 0·null이면 미보유다. */
  holdingQuantity: number | null
  plan: PracticeExitPlanSummary | null
  /**
   * 지금 새 예약을 걸 수 있는가(서버 판정). **보유 중이고 예약이 없어도 `false`일 수 있다** —
   * 예약은 한 진입에 한 번만 걸리므로, 걸었다 취소한 진입이 정확히 그 상태다. 그 상태에서 "다시
   * 걸어 주세요"라고 말하면 누를 때마다 실패하는 안내가 된다.
   */
  canReserve: boolean
  experience: ExitExperience
  /** 이번 실행에서 한 번이라도 사 봤는가(진입 기록이 있는가). */
  hasTraded: boolean
}

/**
 * 판정 순서가 곧 학습 순서다. **보유 여부를 먼저 본다** — 손절을 겪은 뒤 다시 사서 보유 중인 사용자는
 * "손절을 겪었다"가 아니라 "지금 예약을 걸어야 한다"를 들어야 하기 때문이다. 겪은 것은 아래 진행
 * 표시(칩)가 계속 말해 주므로 문구까지 과거를 반복할 필요가 없다.
 */
export function exitJourneyPhase({
  holdingQuantity,
  plan,
  canReserve,
  experience,
  hasTraded,
}: ExitJourneyInput): ExitJourneyPhase {
  const holding = holdingQuantity !== null && holdingQuantity > 0
  if (holding) {
    if (plan !== null) return 'PLAN_PENDING'
    return canReserve ? 'HOLDING_NO_PLAN' : 'HOLDING_PLAN_SPENT'
  }
  if (experience.stopLoss && experience.takeProfit) return 'BOTH'
  if (experience.stopLoss) return 'STOP_LOSS_ONLY'
  if (experience.takeProfit) return 'TAKE_PROFIT_ONLY'
  return hasTraded ? 'SOLD_WITHOUT_EXPERIENCE' : 'BEFORE_BUY'
}

const JOURNEY_STEPS = ['사기', '예약 걸기', '기다리기'] as const

/** 지금 어느 칸에 서 있는가. 다 겪은 뒤(BOTH)에는 어디도 가리키지 않는다. */
function currentStepIndex(phase: ExitJourneyPhase): number | null {
  if (phase === 'HOLDING_NO_PLAN') return 1
  if (phase === 'PLAN_PENDING') return 2
  if (phase === 'BOTH') return null
  // HOLDING_PLAN_SPENT는 이 진입에서 할 수 있는 게 없다 — 다음 할 일이 "정리하고 다시 사기"라 1번이다.
  return 0
}

/**
 * 아직 안 겪은 쪽을 다음 목표로 말해 준다. 둘 다 안 겪었으면 굳이 고르지 않는다 — 어느 쪽을 먼저
 * 겪을지는 값의 움직임이 정하지, 화면이 정하는 것이 아니다.
 */
function remainingGoalSentence(experience: ExitExperience): string | null {
  if (experience.stopLoss && !experience.takeProfit) return '이제 익절을 겪어 볼 차례입니다.'
  if (experience.takeProfit && !experience.stopLoss) return '이제 손절을 겪어 볼 차례입니다.'
  return null
}

function phaseText(
  phase: ExitJourneyPhase,
  plan: PracticeExitPlanSummary | null,
  experience: ExitExperience,
): { title: string; body: string; tone: 'urgent' | 'calm' | 'done' } {
  const remaining = remainingGoalSentence(experience)
  switch (phase) {
    case 'BEFORE_BUY':
      return {
        title: '먼저 삽니다',
        body: '손절·익절은 산 뒤에 예약을 걸어야 겪을 수 있습니다. 아래에서 시장가나 지정가로 사 보세요.',
        tone: 'calm',
      }
    case 'HOLDING_NO_PLAN':
      return {
        title: '지금 예약을 걸어야 손절·익절을 겪습니다',
        body:
          '샀지만 아직 팔 기준선이 없습니다. 값이 아무리 떨어지거나 올라도 저절로 정리되지 않아요. ' +
          '아래 "예약 매도"에서 손절·익절 비율을 정해 걸어 주세요.' +
          (remaining === null ? '' : ` ${remaining}`),
        tone: 'urgent',
      }
    case 'HOLDING_PLAN_SPENT':
      return {
        title: '이 진입에는 예약을 다시 걸 수 없습니다',
        body:
          '예약은 한 번 산 것에 한 번만 걸 수 있어요(취소한 예약도 그 한 번으로 칩니다). 지금 가진 것을 ' +
          '직접 팔고 다시 사면, 새로 예약을 걸어 손절·익절을 겪어 볼 수 있습니다.' +
          (remaining === null ? '' : ` ${remaining}`),
        tone: 'calm',
      }
    case 'PLAN_PENDING':
      return {
        title: '예약을 걸었습니다. 이제 기다립니다.',
        body:
          plan === null
            ? '값이 손절선에 먼저 닿으면 더 잃지 않도록, 익절선에 먼저 닿으면 이익을 챙기고 자동으로 정리됩니다.'
            : `값이 손절선 ${formatKRW(plan.stopLossPrice)}에 먼저 닿으면 더 잃지 않도록 자동으로 정리되고, ` +
              `익절선 ${formatKRW(plan.takeProfitPrice)}에 먼저 닿으면 이익을 챙기고 정리됩니다. ` +
              '옆 차트의 점선 두 개가 그 선이에요.',
        tone: 'calm',
      }
    case 'SOLD_WITHOUT_EXPERIENCE':
      return {
        title: '직접 팔아서 정리했습니다. 손절·익절은 아직 겪지 않았어요.',
        body: '다시 사서 예약 매도를 걸어 두면, 값이 선에 닿는 순간 자동으로 정리되는 것을 겪어 볼 수 있습니다.',
        tone: 'calm',
      }
    case 'STOP_LOSS_ONLY':
      return {
        title: '손절을 겪었습니다. 이제 익절을 겪어 볼 차례입니다.',
        body: '다시 사서 예약을 걸면 이번엔 값이 올라 익절선에 닿는 쪽을 볼 수 있습니다. 여기서 그만두고 되돌아보기로 마무리해도 괜찮습니다.',
        tone: 'urgent',
      }
    case 'TAKE_PROFIT_ONLY':
      return {
        title: '익절을 겪었습니다. 이제 손절을 겪어 볼 차례입니다.',
        body: '다시 사서 예약을 걸면 값이 떨어져 손절선에 닿는 쪽을 볼 수 있습니다. 여기서 그만두고 되돌아보기로 마무리해도 괜찮습니다.',
        tone: 'urgent',
      }
    case 'BOTH':
      return {
        title: '손절과 익절을 모두 겪었습니다.',
        body: '이 연습에서 가장 중요한 두 가지를 다 겪었습니다. 되돌아보기에 한 줄 남기고 마무리해도 좋고, 더 해 봐도 좋습니다.',
        tone: 'done',
      }
  }
}

interface Props extends ExitJourneyInput {
  /** 예약을 걸었다가 취소한 직후인가. 취소가 조용히 끝나지 않도록 한 줄을 덧붙인다. */
  cancelledOnce: boolean
  /** "예약 매도" 탭을 여는 경로. 지금 열 수 없는 상태면 null을 준다(버튼을 그리지 않는다). */
  onOpenReservation: (() => void) | null
}

export function ExitJourneyGuide({
  holdingQuantity,
  plan,
  canReserve,
  experience,
  hasTraded,
  cancelledOnce,
  onOpenReservation,
}: Props) {
  const phase = exitJourneyPhase({ holdingQuantity, plan, canReserve, experience, hasTraded })
  const { title, body, tone } = phaseText(phase, plan, experience)
  const stepIndex = currentStepIndex(phase)
  const toneClass =
    tone === 'urgent'
      ? 'border-loss/40 bg-loss/10'
      : tone === 'done'
        ? 'border-gain/40 bg-gain/10'
        : 'border-line bg-elevated/60'

  return (
    <section aria-label="손절·익절 학습 진행" className={`rounded-2xl border p-4 ${toneClass}`}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {JOURNEY_STEPS.map((label, index) => {
          const current = stepIndex === index
          return (
            <li key={label} className="flex items-center gap-1.5">
              <span
                aria-current={current ? 'step' : undefined}
                className={`rounded-full px-2 py-0.5 ${
                  current ? 'bg-white/[0.12] font-medium text-ink' : 'text-muted'
                }`}
              >
                {index + 1}. {label}
              </span>
              {index < JOURNEY_STEPS.length - 1 && <span className="text-muted/60">›</span>}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
      {/*
        `HOLDING_PLAN_SPENT`에는 붙이지 않는다 — 그 국면 본문이 이미 "취소한 예약도 그 한 번으로
        친다"고 말하고, 예약 패널도 취소 사실을 말한다. 같은 문장을 세 곳에서 읽게 하지 않는다.
      */}
      {cancelledOnce && phase === 'HOLDING_NO_PLAN' && (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          방금 예약을 취소했습니다. 지금 상태로는 값이 선에 닿아도 아무 일도 일어나지 않아요.
        </p>
      )}
      {onOpenReservation !== null && (
        <Button type="button" size="sm" className="mt-3" onClick={onOpenReservation}>
          예약 매도 열기
        </Button>
      )}
      {/*
        진행 표시 — 이번 실행에서 무엇을 겪었는지를 문구와 별개로 **계속** 보여준다. 문구는 상태가
        바뀌면 사라지지만 이 두 칸은 남아서 "아직 익절은 못 겪었다"를 언제든 확인시켜 준다.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="이번 연습에서 겪은 것">
        {(
          [
            ['손절 겪기', experience.stopLoss],
            ['익절 겪기', experience.takeProfit],
          ] as const
        ).map(([label, done]) => (
          <span
            key={label}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              done ? 'border-gain/40 bg-gain/10 text-gain' : 'border-line bg-elevated text-muted'
            }`}
          >
            {done ? '✓ ' : ''}
            {label}
          </span>
        ))}
      </div>
    </section>
  )
}
