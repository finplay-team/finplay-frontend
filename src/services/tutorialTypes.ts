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

/* ---------- 2단계 코인 전용: 가상 가격 세션·교육 지정가 (030) ---------- */

export type PracticePriceSessionStatus = 'ACTIVE' | 'COMPLETED'

/**
 * 사용자·종목당 ACTIVE 세션 1개만 허용된다. 매 tick 당 결정적 ±1% 변동(seed 는 노출되지 않는다).
 * tick 99 에 도달하면 status 가 COMPLETED 로 전이하고 그 세션의 미체결 주문은 서버가 자동 취소한다.
 */
export interface PracticePriceSessionResponse {
  sessionId: number
  instrumentId: number
  status: PracticePriceSessionStatus
  generatorVersion: number
  startPrice: Decimal
  currentTick: number
  currentPrice: Decimal
  tickSeconds: number
  totalTicks: number
  createdAt: LocalDateTimeString
  completedAt: LocalDateTimeString | null
}

/**
 * quantity 는 1단계 의도(PracticeIntentionResponse.quantity)와 반드시 같아야 한다 —
 * 026 chain 해석이 buyTrade 수량과 intention 수량의 일치를 요구한다. side 는 서버가 BUY로 고정한다.
 */
export interface PracticeLimitOrderCreateRequest {
  practicePriceSessionId: number
  instrumentId: number
  /** 문자열로 보낸다 (부동소수 오차 회피, orderService 의 지정가 주문과 같은 규칙) */
  quantity: string
  limitPrice: string
}

/**
 * order 도메인의 LimitOrderResponse 와 같은 모양을 재사용한다. 생성 응답의 status 는 항상
 * PENDING 이다 — 체결은 세션 tick 진행에서만 일어나고 이 응답에는 반영되지 않는다(체결 감지는
 * orderService.getOrders 로 별도 확인해야 한다).
 */
export interface PracticeLimitOrderResponse {
  orderId: number
  market: 'CRYPTO'
  instrumentId: number
  side: 'BUY'
  orderType: 'LIMIT'
  status: 'PENDING'
  quantity: Decimal
  limitPrice: Decimal
  requestedAt: LocalDateTimeString
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
/**
 * AWAITING_SALE·EXPIRED는 샘플 종목 chain의 4단계에서만 등장한다(031). AWAITING_SALE은
 * locked=false로 온다 — 다른 모든 NOT_STARTED는 locked=true와 짝을 이루므로 절대 같은 값으로
 * 취급하면 안 된다(지금 매도해야 하는 실행 가능한 단계).
 */
export type PracticeOverallStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'AWAITING_SALE' | 'EXPIRED' | 'COMPLETED'

/**
 * favorite·intention·buyTrade 는 id·시각이 한 쌍으로 null/non-null.
 * observation 은 id·시각·evidenceType 이 한 삼쌍으로 null/non-null.
 * reflection 은 완료 시에만 non-null. holdingId·참조 손절익절가는 유효 chain 이 있을 때만 채워진다.
 * sellTradeId·sellTradeExecutedAt·saleDeadlineAt(031)은 샘플 종목 chain의 4단계 evidence에서만
 * 채워진다 — 실제 종목 chain과 1~3단계에서는 항상 null이다.
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
  sellTradeId: number | null
  sellTradeExecutedAt: LocalDateTimeString | null
  saleDeadlineAt: LocalDateTimeString | null
}

/**
 * 실제 종목 chain은 항상 3단계, 샘플 종목 chain은 항상 4단계(031) — steps 배열 길이로 구분한다.
 * 4번째 단계(매도·복기)는 샘플 종목 chain에만 존재한다.
 */
export interface PracticeStepResponse {
  step: 1 | 2 | 3 | 4
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
