// 진행 조회에서 "지금 걸린 예약"·"예약을 걸 수 있는가"·"손절·익절을 겪었는가"를 읽는 단 하나의 자리
import type { InvestmentPracticeResponse, PracticeExitPlanSummary } from './tutorialTypes'

/**
 * **읽는 자리를 여기로 좁혀 둔 이유.** 이 세 값을 내려주는 백엔드가 아직 머지·배포 전이라, 붙어 있는
 * 서버에 따라 필드가 있기도 없기도 하다. 화면 곳곳에서 `progress.pendingExitPlan`을 직접 읽으면 그
 * 분기가 열 군데로 퍼진다. 계약 자체는 2026-08-21에 백엔드(`be-exit-plan-manual`)로 확정됐다.
 */

export interface ExitExperience {
  /** 이번 실행에서 손절선에 닿아 자동 정리된 적이 있는가. */
  stopLoss: boolean
  /** 이번 실행에서 익절선에 닿아 자동 정리된 적이 있는가. */
  takeProfit: boolean
}

/**
 * 서버가 `BigDecimal`을 문자열로 직렬화할 수 있어(백엔드 예시 응답이 그렇다) 숫자로 강제한다.
 * 이걸 빼먹으면 `entryPrice - stopLossPrice`가 조용히 문자열 연결이 되고, 금액 문구가 통째로 깨진다.
 */
function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

export function readPendingExitPlan(
  progress: InvestmentPracticeResponse,
): PracticeExitPlanSummary | null {
  const plan = progress.pendingExitPlan
  if (!plan) return null
  return {
    ...plan,
    stopLossRate: toNumber(plan.stopLossRate),
    takeProfitRate: toNumber(plan.takeProfitRate),
    stopLossPrice: toNumber(plan.stopLossPrice),
    takeProfitPrice: toNumber(plan.takeProfitPrice),
    entryPrice: plan.entryPrice === undefined ? undefined : toNumber(plan.entryPrice),
  }
}

/**
 * 지금 새 예약을 걸 수 있는가. **"보유 중이고 예약이 없다"로 대신 계산하면 안 된다** — 예약은 한
 * 진입에 한 번만 걸리므로(write-once), 걸었다 취소한 진입은 그 조건을 만족하면서도 서버가 409
 * `EXIT_PLAN_ALREADY_EXISTS`로 거부한다. 서버 판정이 있으면 언제나 그쪽을 쓴다.
 *
 * 서버가 아직 이 필드를 안 주는 동안만 보유·예약 유무로 어림한다 — 그 서버에는 애초에 취소 후
 * 재예약이라는 상태가 없으므로(자동 예약 시절) 어림이 틀릴 여지도 없다.
 */
export function readExitPlanCreatable(
  progress: InvestmentPracticeResponse,
  fallback: boolean,
): boolean {
  return progress.exitPlanCreatable ?? fallback
}

/**
 * 서버 판정을 우선하고, 아직 그 필드를 안 내려주는 서버에서는 **진입 기록의 매도 원인**으로 같은
 * 판정을 만든다. `entries[]`는 현재 실행 세대의 진입만 담으므로(재시작하면 비워진다) "이번 실행에서
 * 겪었는가"라는 질문에 그대로 답이 되고, 수동 매도(`MANUAL`)를 세지 않는 것도 서버와 같다.
 */
export function readExitExperience(progress: InvestmentPracticeResponse): ExitExperience {
  const experience = progress.exitExperience
  if (experience) {
    return { stopLoss: experience.stopLossExperienced, takeProfit: experience.takeProfitExperienced }
  }
  return {
    stopLoss: progress.entries.some((entry) => entry.sellCause === 'STOP_LOSS'),
    takeProfit: progress.entries.some((entry) => entry.sellCause === 'TAKE_PROFIT'),
  }
}

/**
 * 방금 건 예약을 **서버 응답이 도착하기 전까지** 화면이 대신 들고 있기 위한 값. 진행 조회가 아직
 * 예약 정보를 안 내려주는 배포 전 상태에서도 "걸었다"가 화면에 남아야 하기 때문이다.
 *
 * ⚠️ 가격은 **화면이 기준가에서 계산한 어림값**이다 — 서버가 확정한 값이 오면 언제나 그쪽이 이긴다.
 * `exitPlanId`가 null인 이유도 같다(id는 서버만 안다) — 그래서 이 값으로 그린 예약 카드에는 취소
 * 버튼이 뜨지 않는다. 없는 번호로 DELETE를 부르는 것보다 버튼이 없는 편이 낫다.
 */
export function estimateExitPlan(
  entryPrice: number,
  stopLossRate: number,
  takeProfitRate: number,
): PracticeExitPlanSummary {
  return {
    exitPlanId: null,
    stopLossRate,
    takeProfitRate,
    stopLossPrice: entryPrice * (1 - stopLossRate / 100),
    takeProfitPrice: entryPrice * (1 + takeProfitRate / 100),
    entryPrice,
  }
}
