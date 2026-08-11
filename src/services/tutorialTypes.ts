// 3단계 투자 실습 튜토리얼(spec 016+026, 시장가 매매 기반 holding 경로) 응답·요청 타입
import type { Decimal, LocalDateTimeString, Market } from './types'

/* ---------- 1단계: 즐겨찾기 (튜토리얼 전용, 인메모리 — ADR-0012) ---------- */

/**
 * 서버 재시작·재배포 시 유실된다(재등록 필요). 관심목록(watchlistService)과 완전히 다른 기능이므로
 * 절대 같은 UI 자리·아이콘을 공유하지 않는다.
 */
export interface FavoriteResponse {
  favoriteId: number
  instrumentId: number
  market: Market
  symbol: string
  name: string
  createdAt: LocalDateTimeString
}

export interface FavoriteListResponse {
  content: FavoriteResponse[]
}

/* ---------- 2단계: 매수 전 의도 기록 (인메모리) ---------- */

/**
 * 계약 예시가 quantity·stopLoss·takeProfit 을 숫자 리터럴로 보낸다(주문 API 의 문자열 규칙과 다르다,
 * MUST-VERIFY — 문서에 별도 문자열 지시가 없다). 서버가 BigDecimal 로 받으므로 정수·소수 모두
 * JS number 정밀도 범위 안에서는 안전하다.
 */
export interface PracticeIntentionCreateRequest {
  instrumentId: number
  quantity: number
  stopLoss: number
  takeProfit: number
}

export interface PracticeIntentionResponse {
  intentionId: number
  instrumentId: number
  quantity: Decimal
  stopLoss: Decimal
  takeProfit: Decimal
  createdAt: LocalDateTimeString
}

/* ---------- 튜토리얼 전용 합성 시세 (evidence 와 무관한 순수 참고용) ---------- */

/** prices 는 항상 100개, tickSeconds 는 항상 3. 저장소 없이 요청마다 새로 계산된다. */
export interface SyntheticPriceSeriesResponse {
  title: string
  tickSeconds: number
  prices: number[]
}

/* ---------- 3단계: 가격 관찰·복기 (holding 기준, 026) ---------- */

export type PracticeEvidenceType = 'CLOSER_TO_BOUNDARY' | 'TIMED_REPETITION'
export type PracticeBoundary = 'STOP_LOSS' | 'TAKE_PROFIT'

export interface PracticeHoldingObservationResponse {
  observationId: number
  holdingId: number
  currentPrice: Decimal
  observedAt: LocalDateTimeString
  /** A 조건 미충족이면 null */
  closerToBoundary: boolean | null
  closerBoundary: PracticeBoundary | null
  /** A·B 모두 미충족이면 null. 이 경로엔 FINAL_EVENT(evidence C)가 없다. */
  evidenceType: PracticeEvidenceType | null
}

export interface PracticeHoldingReflectionResponse {
  reflectionId: number
  holdingId: number
  prompt: string
  answer: string
  createdAt: LocalDateTimeString
}

/* ---------- 진행 조회 (holding 기준, market 필수) ---------- */

export type PracticeTutorialKey = 'INVESTMENT_PRACTICE_V1' | 'COIN_PRACTICE_V1'
export type PracticeOverallStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

/**
 * favorite·intention·buyTrade 는 id·시각이 한 쌍으로 null/non-null.
 * observation 은 id·시각·evidenceType 이 한 삼쌍으로 null/non-null.
 * reflection 은 완료 시에만 non-null. holdingId·참조 손절익절가는 유효 chain 이 있을 때만 채워진다.
 */
export interface PracticeEvidenceResponse {
  favoriteId: number | null
  favoriteCreatedAt: LocalDateTimeString | null
  intentionId: number | null
  intentionCreatedAt: LocalDateTimeString | null
  buyTradeId: number | null
  buyTradeExecutedAt: LocalDateTimeString | null
  holdingId: number | null
  referenceStopLossPrice: Decimal | null
  referenceTakeProfitPrice: Decimal | null
  observationId: number | null
  observationObservedAt: LocalDateTimeString | null
  evidenceType: PracticeEvidenceType | null
  reflectionId: number | null
  reflectionCreatedAt: LocalDateTimeString | null
}

export interface PracticeStepResponse {
  step: 1 | 2 | 3
  status: PracticeOverallStatus
  /** 직전 단계 미완료면 true. locked 단계도 evidence 객체 자체는 항상 온다(필드는 전부 null). */
  locked: boolean
  evidence: PracticeEvidenceResponse
}

/** GET /api/education/practice?market=STOCK|CRYPTO */
export interface InvestmentPracticeResponse {
  tutorialKey: PracticeTutorialKey
  status: PracticeOverallStatus
  /** 완료 시 null */
  currentStep: number | null
  steps: PracticeStepResponse[]
  /** 완료 전 null */
  completedAt: LocalDateTimeString | null
}
