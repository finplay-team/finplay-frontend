// 영속 attempt 기반 투자 실습의 진입·차트·관찰·복기·진행 API를 제공하는 서비스
import { api } from '../lib/apiClient'
import type { Market } from './types'
import type {
  InvestmentPracticeResponse,
  PracticeHoldingObservationResponse,
  PracticeHoldingReflectionResponse,
  PracticeAttemptResponse,
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

export function restartPracticeAttempt(market: Market): Promise<PracticeAttemptResponse> {
  return api.post<PracticeAttemptResponse>(`/education/practice/attempts/${market}/restart`)
}

export function getPracticeAttemptChart(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.get<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/chart`)
}

export function tickPracticeAttempt(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.post<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/tick`)
}
