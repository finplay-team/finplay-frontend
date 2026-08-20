// 영속 attempt 기반 투자 실습의 진입·차트·관찰·복기·진행 API를 제공하는 서비스
import { api } from '../lib/apiClient'
import type { Market } from './types'
import type {
  InvestmentPracticeResponse,
  PracticeExitPreset,
  PracticeHoldingObservationResponse,
  PracticeHoldingReflectionResponse,
  PracticeAttemptResponse,
  PracticeOrderResponse,
  PracticeTutorialChartResponse,
} from './tutorialTypes'

/**
 * 3단계 가격 관찰 기록(append-only). 멱등키가 없다 — 호출마다 새 행이 쌓인다.
 * chain 재해석 실패는 409 PRACTICE_EVIDENCE_MISSING, 서버 유효 현재가 없음은 409 PRICE_UNAVAILABLE.
 */
export function recordHoldingObservation(
  holdingId: number,
): Promise<PracticeHoldingObservationResponse> {
  return api.post<PracticeHoldingObservationResponse>('/education/practice/holding-observations', {
    holdingId,
  })
}

/**
 * 3단계 자유 복기 저장 + 완료 확정(원자). evidence A·B 중 하나도 없으면 409 PRACTICE_EVIDENCE_MISSING,
 * 이미 완료면 409 PRACTICE_ALREADY_COMPLETED. 최초 호출만 성공하고 이후 재호출은 저장되지 않는다.
 */
export function saveHoldingReflection(
  holdingId: number,
  answer: string,
): Promise<PracticeHoldingReflectionResponse> {
  return api.post<PracticeHoldingReflectionResponse>('/education/practice/holding-reflections', {
    holdingId,
    answer,
  })
}

/**
 * holding 기반 진행 조회. market 필수 — 주식·코인은 완전히 독립된 튜토리얼(별도 tutorialKey)이라
 * 한쪽 조회가 다른 쪽 진행에 영향을 주지 않는다. 3차 MVP OCO 전용 진행조회(`/education/practice/oco`)와
 * URL·완료 key 를 공유하지 않으므로 절대 섞어 쓰면 안 된다.
 */
export function getPracticeProgress(market: Market): Promise<InvestmentPracticeResponse> {
  return api.get<InvestmentPracticeResponse>('/education/practice', { query: { market } })
}

export function ensurePracticeAttempt(market: Market): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}`)
}

export function selectPracticeInstrument(
  market: Market,
  instrumentId: number,
): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}/instrument`, {
    instrumentId,
  })
}

/**
 * 손절·익절 프리셋 선택(042, 이슈 #477). 자연 멱등이라 `Idempotency-Key`가 필요 없다. 보유 중이면
 * 409 `PRACTICE_STEP_LOCKED`로 거부된다 — 매수 전이거나 포지션을 정리한 뒤(재진입 대기)에만 통한다.
 */
export function selectExitPreset(
  market: Market,
  preset: PracticeExitPreset,
): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}/exit-preset`, {
    preset,
  })
}

export function restartPracticeAttempt(market: Market): Promise<PracticeAttemptResponse> {
  return api.post<PracticeAttemptResponse>(`/education/practice/attempts/${market}/restart`)
}

export function getPracticeAttemptChart(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.get<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/chart`)
}

export function tickPracticeAttempt(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.post<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/tick`)
}

/**
 * 튜토리얼 attempt 자기 주문 조회(435). /api/orders·/api/orders/pending 은 튜토리얼 샌드박스 종목
 * 주문을 걸러내므로(spec 033) 튜토리얼 화면의 주문 상태 폴링·복원은 이 엔드포인트를 써야 한다.
 */
export function getPracticeAttemptOrders(market: Market): Promise<PracticeOrderResponse[]> {
  return api.get<PracticeOrderResponse[]>(`/education/practice/attempts/${market}/orders`)
}
