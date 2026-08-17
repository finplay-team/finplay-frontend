// 영속 attempt 기반 투자 실습의 실행·차트·evidence 응답 타입
import type { Decimal, LocalDateTimeString, Market } from './types'

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

/**
 * reflectionId는 최초 완료만 non-null이다 — 재완료(040, 완료 후 재시작해 다시 완료한 경우)는 새 reflection
 * 행을 만들지 않아 null로 온다. rewardGranted도 재완료면 false다(보상은 사용자·market 조합당 최초 1회만).
 */
export interface PracticeHoldingReflectionResponse {
  reflectionId: number | null
  holdingId: number
  prompt: string
  answer: string
  createdAt: LocalDateTimeString
  rewardGranted: boolean
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
  buyQuantity: Decimal | null
  sellQuantity: Decimal | null
  remainingQuantity: Decimal | null
}

export type PracticeAttemptMode = 'ACTIVE' | 'REPLAY'
export type PracticeAttemptStatus = 'SELECTING_INSTRUMENT' | 'IN_PROGRESS' | 'EXPIRED' | 'COMPLETED'

export interface PracticeRiskSnapshotResponse {
  entryPrice: Decimal
  stopLossPrice: Decimal
  takeProfitPrice: Decimal
  buyTradeId: number
  createdAt: LocalDateTimeString
}

export interface PracticeAttemptResponse {
  attemptId: number
  market: Market
  runNumber: number
  mode: PracticeAttemptMode
  status: PracticeAttemptStatus
  instrumentId: number | null
  anchorAt: LocalDateTimeString | null
  tutorialDate: string | null
  riskSnapshot: PracticeRiskSnapshotResponse | null
  completedAt: LocalDateTimeString | null
}

export interface PracticeTutorialCandleResponse {
  date: string
  open: Decimal
  high: Decimal
  low: Decimal
  close: Decimal
  current: boolean
}

export interface PracticeTutorialChartResponse {
  attemptId: number
  runNumber: number
  instrumentId: number
  virtualDateTime: LocalDateTimeString
  secondsPerVirtualMinute: number
  candles: PracticeTutorialCandleResponse[]
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
  /** 이 시장 튜토리얼을 최초 완료했을 때 지급된 보상 금액(항상 5,000,000) — 완료 전에는 null(이슈 #343). */
  rewardAmount: number | null
  /** attempt가 없는 기존 026 chain 사용자에게만 null이다. */
  attempt: PracticeAttemptResponse | null
}
