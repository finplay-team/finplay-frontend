// 영속 attempt 기반 투자 실습의 실행·차트·evidence 응답 타입
import type { Decimal, LocalDateTimeString, Market, OrderSide, OrderStatus, OrderType } from './types'

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

export type PracticeSellVerdict = 'ABOVE_TAKE_PROFIT' | 'BELOW_STOP_LOSS' | 'BETWEEN_LINES'

/**
 * 필드마다 수수료 기준이 다르다 — 섞어 쓰면 안 된다. buyPrice·sellPrice 는 체결 "단가"라 수수료를
 * 포함하지 않고, realizedPnl·returnRate 는 매수·매도 수수료가 모두 반영된 순손익 기준이다.
 * 따라서 (sellPrice − buyPrice) × 수량 은 realizedPnl 과 수수료만큼 어긋난다 — 클라이언트가 단가로
 * 손익을 다시 계산하면 서버 원장과 다른 숫자를 보여주게 되므로, 손익·수익률은 realizedPnl·returnRate
 * 를 그대로 쓰고 단가는 "얼마에 샀고 얼마에 팔았는지" 표기에만 쓴다.
 */
export interface PracticeTradeResultResponse {
  /** 현재 실행 FILLED BUY 의 수량 가중평균 체결가(수수료 미포함). 매수 전이면 null */
  buyPrice: Decimal | null
  /** 현재 실행 FILLED SELL 의 수량 가중평균 체결가(수수료 미포함). 매도 전이면 null */
  sellPrice: Decimal | null
  /** 현재 실행 매도의 실현손익 합(원) — 매수·매도 수수료가 모두 반영된 순손익이다. 매도 전이면 null */
  realizedPnl: number | null
  /** realizedPnl ÷ (배분 매수원가 + 배분 매수수수료). 매도 전이면 null */
  returnRate: Decimal | null
  /** 매도 전·기준선 부재 시 null */
  sellVerdict: PracticeSellVerdict | null
}

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
  /** 서버 배포 전에는 응답에 아예 없다 — 없어도 화면이 깨지지 않게 옵셔널로 둔다. */
  tradeResult?: PracticeTradeResultResponse | null
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

/**
 * GET /api/education/practice/attempts/{market}/orders 항목 — 11필드 고정, bare array, id 오름차순,
 * 페이지네이션 없음(435, 백엔드 PR #437).
 *
 * /api/orders·/api/orders/pending 은 실거래 화면 보호를 위해 튜토리얼 샌드박스 종목 주문을 의도적으로
 * 제외한다(spec 033, 그대로 유지되는 정책) — 그래서 튜토리얼 화면은 자기 주문 상태를 읽을 때 반드시
 * 이 전용 엔드포인트를 써야 한다. 인증 사용자의 현재 attempt·run에 귀속된 주문만 상태 무관
 * (PENDING·FILLED·CANCELLED) 전부 오며, attempt 가 없으면 빈 배열(오류 아님). 재시작하면 이전 run
 * 주문은 자동으로 빠진다.
 */
export interface PracticeOrderResponse {
  orderId: number
  market: Market
  instrumentId: number
  side: OrderSide
  orderType: OrderType
  status: OrderStatus
  quantity: Decimal
  /** 시장가 주문은 항상 null. 지정가는 값이 있고 체결가 == limitPrice 다. */
  limitPrice: Decimal | null
  requestedAt: LocalDateTimeString
  practiceAttemptId: number
  practiceAttemptRunNumber: number
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
  /**
   * 이 시장 튜토리얼을 최초 완료했을 때 지급된 보상 금액(항상 5,000,000) — 완료 전에는 null(이슈 #343).
   * 한 번 non-null이 되면 계속 그 값을 유지한다 — 040(이슈 #402)부터 완료 후 재시작·재완료할 수 있지만
   * 재완료는 보상을 다시 지급하지 않으므로, 이 필드가 "지금 막 보상을 받았는지"를 뜻하지는 않는다.
   */
  rewardAmount: number | null
  /** attempt가 없는 기존 026 chain 사용자에게만 null이다. */
  attempt: PracticeAttemptResponse | null
}
