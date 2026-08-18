// OCO 손절·익절 예약 생성·목록·취소 서비스 (코인 holding 전용, intentionId 지정 교육 경로는 미지원)
import { api } from '../lib/apiClient'
import type { ExitPlanCreateRequest, ExitPlanListResponse, ExitPlanResponse, ExitPlanStatus } from './types'

/** Idempotency-Key 헤더 필수 — 같은 본문 재시도는 최초 응답을 그대로 재현한다. */
export function createExitPlan(
  req: ExitPlanCreateRequest,
  idempotencyKey: string,
): Promise<ExitPlanResponse> {
  return api.post<ExitPlanResponse>('/exit-plans', req, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** status 생략 시 서버 기본값은 PENDING이다. market·holdingId로 필터링하지 않으므로 호출부가 직접 골라낸다. */
export function getExitPlans(status?: ExitPlanStatus): Promise<ExitPlanListResponse> {
  return api.get<ExitPlanListResponse>('/exit-plans', { query: { status } })
}

/** 본인 소유 PENDING 예약만 취소할 수 있다 — 204, 본문 없음. */
export function cancelExitPlan(exitPlanId: number): Promise<void> {
  return api.del<void>(`/exit-plans/${exitPlanId}`)
}
