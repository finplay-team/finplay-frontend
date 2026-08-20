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

/**
 * 042(이슈 #477) 손절·익절 프리셋 3종. 표시 이름(조심스럽게·보통·느긋하게)은 서버가 주지 않는다 —
 * 서버가 쓰지 않는 문구를 열거형에 두지 않기로 정했으므로 화면이 갖는다.
 */
export type PracticeExitPreset = 'CAUTIOUS' | 'BALANCED' | 'RELAXED'

/**
 * 고를 수 있는 프리셋 하나의 식별자와 비율. **비율은 퍼센트 수다**(3%는 `3`, `0.03`이 아니다) —
 * `exit_plans.stop_loss_rate`와 단위를 맞춘 것이고, 100으로 다시 나누면 100배 틀린 값이 조용히 나온다.
 * `stopLossRate`·`takeProfitRate` 모두 양수 크기이며 부호는 이름으로만 정해진다(손절은 −, 익절은 +).
 */
export interface PracticeExitPresetOption {
  preset: PracticeExitPreset
  stopLossRate: number
  takeProfitRate: number
}

export interface PracticeRiskSnapshotResponse {
  entryPrice: Decimal
  stopLossPrice: Decimal
  takeProfitPrice: Decimal
  buyTradeId: number
  createdAt: LocalDateTimeString
  /** 그 진입에 실제로 적용된 프리셋. 기능 도입 전 스냅샷은 서버가 기본 프리셋으로 해석해 내려보낸다. */
  exitPreset: PracticeExitPreset
  stopLossRate: number
  takeProfitRate: number
  /** 그 실행 세대의 몇 번째 진입인지(1부터). 손절 후 재매수하면 2다. */
  entrySequence: number
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
  /**
   * `PUT .../attempts/{market}`(진입)·`POST .../restart`(재시작) 응답만 그 트랜잭션의 실제 값을 채운다.
   * 그 외 호출부(`PUT .../instrument`, `GET /api/education/practice`의 `attempt` 필드)는 계좌를 다시
   * 조회하지 않아 세 필드 모두 `0`을 반환한다 — 화면은 이 값을 "지금 잔고"로 오해하면 안 된다.
   */
  tutorialCashBalance: number
  tutorialAvailableCash: number
  tutorialRealizedPnl: number
  /**
   * 현재 실행 세대의 선택값. **미선택이면 `null`이 아니라 `"BALANCED"`(기본 프리셋)로 온다** — 화면이
   * null 분기를 갖지 않아도 되고, 보이는 값과 실제로 적용될 값이 항상 같다.
   */
  selectedExitPreset: PracticeExitPreset
  /**
   * **잠금 기준은 "최초 매수 여부"가 아니라 "지금 보유 중인가"다.** 매수 전과 포지션을 정리한 뒤(재진입
   * 대기)에는 몇 번이든 바꿀 수 있고, 보유 중에만 막힌다.
   */
  exitPresetLocked: boolean
  /** 고정 3개. 비율만 오고 표시 이름은 화면이 붙인다. */
  availableExitPresets: PracticeExitPresetOption[]
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

/* ---------- 대본 진행·사건 (041, 이슈 #488) ---------- */

/**
 * 대본 내부 구간이 아니라 **act 단위**다. `FINISHED`가 대본 종료 알림이며 서버에 별도 완료 플래그가
 * 없다 — 다만 실습 완료·보상 지급과는 다른 사건이므로 묶어서 판정하면 안 된다(보상은 복기 저장이
 * 확정하고 `rewardAmount`로 내려온다).
 *
 * 대본을 쓰지 않는 실행(주식 튜토리얼·완료 replay)은 `null`이라, 화면은 `scenarioStage === null`로
 * "대본 UI 없음"을 판정한다.
 */
export type ScenarioStage =
  | 'IDLE_ENTRY'
  | 'ACT1'
  | 'ACT2'
  | 'IDLE_REENTRY'
  | 'ACT3'
  | 'ACT4'
  | 'FINISHED'

/**
 * **두 값뿐이고 그게 의도다.** 미공개 사건이 있는 구간도 `NONE_KNOWN`이라 "아직 안 밝혀졌다"와
 * "원래 원인이 없다"를 구분할 수 없다(SCENARIO-015·016). 화면이 둘을 다르게 그리면 "곧 뉴스가 뜬다"는
 * 신호가 되어 이 기능이 막으려던 스포일러가 되므로, `NONE_KNOWN`은 언제나 한 문구로만 그린다.
 *
 * 판정은 막이 아니라 대본 구간 단위라, 2막 속임수 반등은 앞 구간 루머가 공개된 뒤에도 `NONE_KNOWN`이다
 * — `scenarioStage`가 ACT2로 고정된 채 이 값만 두 번 바뀌는 구간이 실제로 있고 버그가 아니다.
 */
export type ScenarioCauseStatus = 'REVEALED' | 'NONE_KNOWN'

/**
 * **시각을 담지 않는다.** 사건 공개는 대본 커서가, `virtualDateTime`은 벽시계가 정해 두 시계가
 * 어긋나기 때문이다(041 4·5번). 배열 순서가 공개 순서이고 **마지막 항목이 가장 최근**이라, 화면은
 * 순서만 보고 "방금"·"조금 전"으로 그린다 — "12분 전" 같은 숫자를 만들면 틀린다.
 *
 * `headline`은 대본에 사전 확정된 고정 문안이고 `[연습]` 접두가 이미 붙어 있다. 캡처해 밖으로 옮겨도
 * 가상 사건임이 문구 자체에 남아야 하므로 접두를 떼지 않는다(SCENARIO-017).
 */
export interface PracticeScenarioEventResponse {
  stage: ScenarioStage
  headline: string
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
  /**
   * 대본을 쓰지 않는 실행은 아래 세 필드가 `null`이고 `revealedEvents`가 빈 배열이다.
   * **매수하면 다음 tick 응답에서 곧바로 진행 구간으로 온다**(백엔드 커밋 0af28fb) — 화면에서 낙관적으로
   * 덮어쓰거나 한 틱을 무시하는 보정을 넣지 않는다. 지연이 보이면 백엔드 회귀다.
   */
  scenarioStage: ScenarioStage | null
  /** 현재 구간이 진행 구간인가. **보유 여부와 무관하다** — 미보유로 4막을 관전 중이어도 true다. */
  scenarioProgressing: boolean | null
  causeStatus: ScenarioCauseStatus | null
  revealedEvents: PracticeScenarioEventResponse[]
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

export type PracticeSellCause = 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL'

/**
 * 진입 하나의 기준선·매수·매도와 "안 팔았다면"의 대조(041 SCENARIO-019b·021, 이슈 #488).
 *
 * **왜 필요한가** — 042가 재진입을 열면서 한 실행에 매도가 둘 이상 생겼는데 `tradeResult`의 매도 시각·
 * 원인은 **첫 매도** 기준이라, 2막 손절 → 3막 익절한 사용자의 완료 화면에 손절 하나만 뜬다(금액은 맞고
 * 이야기가 틀린다). 이 배열이 그 결함을 닫는다.
 *
 * ⚠️ **`realizedPnl`·`unrealizedPnlIfHeld`는 `sellQuantity` 기준이다** — 부분 매도한 진입에서는
 * `buyQuantity`와 다르므로, 두 금액을 전체 매수 수량의 것으로 표시하면 틀린다.
 *
 * ⚠️ **두 금액을 클라이언트에서 다시 계산하지 않는다.** 매수·매도 수수료가 모두 반영된 서버 원장 값이라
 * 단가 × 수량으로 재계산하면 어긋난다(백엔드 이슈 #421).
 */
export interface PracticeEntryResponse {
  /** 실행 세대 안의 몇 번째 진입인가(1부터). 손절 후 재매수하면 2다. */
  entrySequence: number
  exitPreset: PracticeExitPreset
  buyAt: LocalDateTimeString
  buyPrice: Decimal
  buyQuantity: Decimal
  stopLossPrice: Decimal
  takeProfitPrice: Decimal
  /** 매도 전이면 null. 수량 가중평균 단가다. */
  sellPrice: Decimal | null
  /** 그 진입에서 **팔린** 수량 합. 아래 두 금액의 기준이다. */
  sellQuantity: Decimal | null
  sellAt: LocalDateTimeString | null
  sellCause: PracticeSellCause | null
  /** 매수·매도 수수료가 모두 반영된 실현손익(원). 매도 전이면 null */
  realizedPnl: number | null
  /** 팔지 않고 들고 있었다면의 평가손익(원). 대본을 쓰지 않는 실행이면 null */
  unrealizedPnlIfHeld: number | null
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
  /**
   * 진입별 대조 배열(진입 순번 오름차순). **대본 여부와 무관하게 채운다** — 재진입은 시장을 가리지
   * 않는다. 매수 전이거나 attempt가 없는 legacy 경로는 빈 배열이다.
   */
  entries: PracticeEntryResponse[]
  /**
   * "그때 팔지 않았다면"의 기준 가격이며 `unrealizedPnlIfHeld`가 이 가격으로 계산된다.
   * **실습 중에는 현재 대본가, 완료 응답에서는 이야기의 마지막 진행 구간 끝 가격**이다.
   *
   * 화면은 어느 쪽인지 판단하지 말고 받은 값을 그대로 비교 기준으로 그린다 — **클라이언트가 "끝 가격"을
   * 추측해 만들면 결말 스포일러가 된다**(SCENARIO-021). 대본을 쓰지 않는 실행은 null이다.
   */
  priceAfterSell: number | null
  /** 그 실행에서 공개된 사건만 공개 순서로. 완료 시점에도 미공개 사건은 노출하지 않는다(SCENARIO-020). */
  revealedEvents: PracticeScenarioEventResponse[]
  /** attempt가 없는 기존 026 chain 사용자에게만 null이다. */
  attempt: PracticeAttemptResponse | null
}
