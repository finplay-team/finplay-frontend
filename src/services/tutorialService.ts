// 3단계 투자 실습 튜토리얼 서비스 — 즐겨찾기·의도 기록·합성 시세·관찰·복기·진행 조회
import { api } from '../lib/apiClient'
import type { Market } from './types'
import type {
  FavoriteListResponse,
  FavoriteResponse,
  InvestmentPracticeResponse,
  PracticeHoldingObservationResponse,
  PracticeHoldingReflectionResponse,
  PracticeIntentionCreateRequest,
  PracticeIntentionResponse,
  SyntheticPriceSeriesResponse,
} from './tutorialTypes'

/** createdAt DESC 순으로 온다. 페이지네이션 없음. */
export async function getFavorites(): Promise<FavoriteResponse[]> {
  const res = await api.get<FavoriteListResponse>('/favorites')
  return res.content
}

/** 이미 등록된 종목은 409 DUPLICATE_RESOURCE, 거래정지 종목은 409 INSTRUMENT_NOT_TRADABLE. */
export function addFavorite(instrumentId: number): Promise<FavoriteResponse> {
  return api.post<FavoriteResponse>('/favorites', { instrumentId })
}

/** 타인 소유·재시작 후 유실은 모두 404 FAVORITE_NOT_FOUND 로 온다(존재 비노출). */
export function removeFavorite(instrumentId: number): Promise<void> {
  return api.del<void>(`/favorites/${instrumentId}`)
}

/**
 * 현재 본인 favorite 와 같은 종목만 허용한다(아니면 409 PRACTICE_STEP_LOCKED).
 * 이미 완료된 시장이면 저장 없이 409 PRACTICE_ALREADY_COMPLETED.
 */
export function createPracticeIntention(
  req: PracticeIntentionCreateRequest,
): Promise<PracticeIntentionResponse> {
  return api.post<PracticeIntentionResponse>('/education/practice/intentions', req)
}

/**
 * 튜토리얼 전용 순수 참고용 시세 — evidence 계산과 무관하고 어디에도 저장되지 않는다.
 * 거래정지 종목도 허용하고 시세가 없으면 fallback 값으로 생성해 PRICE_UNAVAILABLE 이 나지 않는다.
 */
export function getSyntheticPrices(instrumentId: number): Promise<SyntheticPriceSeriesResponse> {
  return api.get<SyntheticPriceSeriesResponse>(`/education/practice/synthetic-prices/${instrumentId}`)
}

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
