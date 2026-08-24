// 손절·익절을 "어디서 겪는지"를 화면이 계속 말해 주는 국면 안내 (사기 → 기준 정하기 → 기다리기 → 겪기)
import { Button } from '../ui/Button'
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

/**
 * 아직 안 겪은 쪽을 다음 목표로 말해 준다. 둘 다 안 겪었으면 굳이 고르지 않는다 — 어느 쪽을 먼저
 * 겪을지는 값의 움직임이 정하지, 화면이 정하는 것이 아니다.
 */
function remainingGoalSentence(experience: ExitExperience): string | null {
  if (experience.stopLoss && !experience.takeProfit) return '이제 익절을 겪어 볼 차례입니다.'
  if (experience.takeProfit && !experience.stopLoss) return '이제 손절을 겪어 볼 차례입니다.'
  return null
}

/**
 * 국면별 본문은 **각 한 문장**이다(2026-08-21 문안 정리). 예전에는 여덟 국면이 전부 2~3문장이라
 * 한 시점에 읽어야 할 문장이 셋씩 있었고, 처음 온 사람은 그런 문단을 읽지 않는다.
 *
 * **가격 숫자를 쓰지 않는다.** 손절·익절선 가격의 정본은 차트 점선과 차트 요약 한 줄 둘뿐이다 —
 * 예전에는 같은 가격이 화면 다섯 곳에 있었다.
 */
function phaseText(
  phase: ExitJourneyPhase,
  experience: ExitExperience,
): { title: string; body: string; tone: 'urgent' | 'calm' | 'done' } {
  const remaining = remainingGoalSentence(experience)
  switch (phase) {
    case 'BEFORE_BUY':
      return {
        title: '먼저 삽니다',
        body: '손절·익절은 산 뒤에 예약을 걸어야 겪을 수 있습니다.',
        tone: 'calm',
      }
    case 'HOLDING_NO_PLAN':
      return {
        title: '아직 팔 기준이 없습니다',
        // **왜 하필 지금 정하는가**를 말한다 — 값이 밀리기 시작하면 같은 숫자를 다르게 고르게 된다.
        body: '값이 흔들리기 전인 지금이 가장 냉정하게 정할 수 있는 때입니다.',
        tone: 'urgent',
      }
    case 'HOLDING_PLAN_SPENT':
      return {
        // 제약을 사실로만 말하면 "왜 막지?"가 남는다. 막는 이유(기준을 들고 있는 동안 고치지 않는다)를
        // 제목이 말하고, 본문은 빠져나갈 길만 남긴다. 감정에서 출발하는 문장은 예약 패널이 맡는다.
        title: '기준은 들고 있는 동안 고치지 않습니다',
        body: '지금 가진 것을 팔고 다시 사면 새로 정할 수 있습니다.',
        tone: 'calm',
      }
    case 'PLAN_PENDING':
      return {
        // 기다리는 동안 "이제 내가 할 일이 없다"가 이 화면이 가르치려는 상태 자체다.
        title: '이제 당신이 판단할 일은 없습니다',
        body: '옆 차트의 점선 두 개 중 먼저 닿는 쪽에서 규칙이 대신 팝니다.',
        tone: 'calm',
      }
    case 'SOLD_WITHOUT_EXPERIENCE':
      return {
        // 비난하지 않고 사실만 — 규칙이 한 일이 아니라 사용자가 한 일이다.
        title: '규칙이 아니라 당신이 팔았습니다',
        body: '다시 사서 예약을 걸어야 손절·익절을 겪어 볼 수 있습니다.',
        tone: 'calm',
      }
    case 'STOP_LOSS_ONLY':
      return {
        title: '손절을 겪었습니다',
        body: remaining ?? '다시 사서 예약을 걸면 익절선에 닿는 쪽을 볼 수 있습니다.',
        tone: 'urgent',
      }
    case 'TAKE_PROFIT_ONLY':
      return {
        title: '익절을 겪었습니다',
        body: remaining ?? '다시 사서 예약을 걸면 손절선에 닿는 쪽을 볼 수 있습니다.',
        tone: 'urgent',
      }
    case 'BOTH':
      return {
        title: '손절과 익절을 다 겪었습니다',
        // 예전 문구는 "되돌아보기로 마무리해도 괜찮습니다"였는데, 그 안내를 따라간 사용자가 잠긴 탭을
        // 만났다. 이제 이 자리에 실제로 누를 버튼이 있으므로 그 버튼을 가리킨다.
        body: "아래 '지금 마무리하기'를 누르면 끝납니다.",
        tone: 'done',
      }
  }
}

interface Props extends ExitJourneyInput {
  /** 예약을 걸었다가 취소한 직후인가. 취소가 조용히 끝나지 않도록 한 줄을 덧붙인다. */
  cancelledOnce: boolean
  /** "예약 매도" 탭을 여는 경로. 지금 열 수 없는 상태면 null을 준다(버튼을 그리지 않는다). */
  onOpenReservation: (() => void) | null
  /**
   * 되돌아보기를 여는 경로. **두 목표를 다 겪은 국면(`BOTH`)에서만 쓴다** — 그 순간이 사용자가
   * "이제 끝내도 된다"는 안내를 받는 유일한 자리인데, 예전에는 그 안내를 따라가도 누를 것이 없었다.
   */
  onFinish: () => void
}

export function ExitJourneyGuide({
  holdingQuantity,
  plan,
  canReserve,
  experience,
  hasTraded,
  cancelledOnce,
  onOpenReservation,
  onFinish,
}: Props) {
  const phase = exitJourneyPhase({ holdingQuantity, plan, canReserve, experience, hasTraded })
  const { title, body, tone } = phaseText(phase, experience)
  const toneClass =
    tone === 'urgent'
      ? 'border-loss/40 bg-loss/10'
      : tone === 'done'
        ? 'border-gain/40 bg-gain/10'
        : 'border-line bg-elevated/60'

  return (
    <section aria-label="손절·익절 학습 진행" className={`rounded-2xl border p-4 ${toneClass}`}>
      {/*
        자체 3칸("1. 사기 › 2. 예약 걸기 › 3. 기다리기")은 지웠다 — 이 화면에 있던 여섯 번째 번호
        체계였고, 진행감은 상단의 목표 칸들(`TutorialGoalRail`)이 전담한다.
      */}
      <p className="text-sm font-medium text-ink">{title}</p>
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
      {/*
        겪은 것을 세는 칸들은 이제 화면 맨 위(`TutorialGoalRail`)에 있다 — 여기 묻어 두면 스크롤해야
        보여서, 끝나는 조건이 화면에서 가장 늦게 읽혔다.
      */}
      {phase === 'BOTH' ? (
        <Button type="button" size="sm" className="mt-3" onClick={onFinish}>
          지금 마무리하기
        </Button>
      ) : (
        onOpenReservation !== null && (
          <Button type="button" size="sm" className="mt-3" onClick={onOpenReservation}>
            손절·익절 예약 열기
          </Button>
        )
      )}
    </section>
  )
}
