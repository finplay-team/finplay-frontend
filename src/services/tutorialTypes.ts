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
 * 042(이슈 #477) 손절·익절 프리셋 3종. **화면에서는 더 이상 고르지 않는다** — 2026-08-21 재설계로
 * 프리셋 픽커가 자유 입력(`exitStopLossRate`·`exitTakeProfitRate`)으로 바뀌었다. 서버가 진입 기록
 * (`PracticeEntryResponse.exitPreset`·`riskSnapshot.exitPreset`)에 아직 이 값을 실어 보내므로 타입만
 * 남긴다. 표시 이름(조심스럽게·보통·느긋하게)은 함께 지웠다 — 사용자에게 없는 개념이다.
 */
export type PracticeExitPreset = 'CAUTIOUS' | 'BALANCED' | 'RELAXED'

/**
 * 손절·익절 비율의 허용 범위(2026-08-21 재설계). **퍼센트 수이고 양 끝을 포함한다**(손절 2~5,
 * 익절 3~8이 서버 기본값). 손절도 양수 크기이며 부호는 이름으로만 정해진다.
 *
 * ⚠️ **화면이 이 숫자를 하드코딩하지 않는다** — 서버가 범위를 바꾸면 입력창만 옛 범위로 남아
 * "저장은 되는데 화면이 막는" 상태가 된다. 서버가 아직 안 내려주는 동안만
 * `FALLBACK_EXIT_RATE_BOUNDS`(ExitRateFields.tsx)로 대신한다.
 */
export interface ExitRateBounds {
  stopLossMin: number
  stopLossMax: number
  takeProfitMin: number
  takeProfitMax: number
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
   * 이 응답을 돌려주는 **쓰기 경로 네 곳**(진입 `PUT .../attempts/{market}`·재시작 `POST .../restart`·
   * 종목 선택 `PUT .../instrument`·손절익절 비율 `PUT .../exit-rates`, 이슈 #502)만 실제 값을 채운다.
   * **`GET /api/education/practice`의 `attempt` 필드는 여전히 세 필드 모두 `0`이다** — 그 경로는 tick과
   * 함께 폴링되느라 호출마다 계좌를 다시 읽지 않기 때문이며, `0`은 "잔고가 0"이 아니라 "이 응답은
   * 계좌를 조회하지 않았다"는 뜻이다. 잔액이 필요한 화면은 반드시 위 네 응답에서 받은 값을 상태로 들고
   * 있어야 하고, 진행 조회 응답의 이 세 필드로 잔액을 그리면 안 된다.
   */
  tutorialCashBalance: number
  tutorialAvailableCash: number
  tutorialRealizedPnl: number
  /**
   * 현재 실행 세대의 손절·익절 비율(2026-08-21 재설계, `PUT .../exit-rates`). **퍼센트 수이고 둘 다
   * 양수다** — 3%는 `3`이지 `0.03`이 아니고, 손절도 `-3`이 아니라 `3`으로 온다(부호는 이름이 정한다).
   * 미선택이면 서버 기본값(3·5)이 오므로 화면은 null 분기를 갖지 않는다.
   *
   * ⚠️ **옵셔널인 이유는 계약이 아니라 배포 순서다** — 계약상 항상 non-null이고(2026-08-21 백엔드
   * 확인 완료), 미선택 실행에도 서버가 기본값 3·5를 채워 보낸다. 다만 이 필드를 내려주는 백엔드가
   * 아직 **머지·배포 전**이라 옛 서버에 붙으면 `undefined`가 온다. 배포를 확인하면 `?`를 뗀다.
   */
  exitStopLossRate?: number
  exitTakeProfitRate?: number
  /**
   * **잠금 기준은 "최초 매수 여부"가 아니라 "지금 보유 중인가"다.** 매수 전과 포지션을 정리한 뒤(재진입
   * 대기)에는 몇 번이든 바꿀 수 있고, 보유 중에만 막힌다. 프리셋이 자유 입력으로 바뀐 뒤에도 같은
   * 제약이라 이름만 옛 것이고 그대로 쓴다(손실 중에 손절선을 내리는 사후 합리화를 막는 제약이다).
   * **서버가 이 이름을 유지하기로 확정했다**(2026-08-21) — `exitRatesLocked` 같은 새 이름은 없다.
   */
  exitPresetLocked: boolean
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
 *
 * **(049, 이슈 #507) `ORDER_BASICS`는 2단계(주문 방법 학습) 대본의 유일한 구간이다.** 사건이 없고
 * (`causeStatus`는 항상 `NONE_KNOWN`, `revealedEvents`는 항상 빈 배열) 대기 구간도 없다 — 진행
 * 구간 하나뿐이다. `frontend-reply-505.md`의 결정대로 **사건 UI(속보 자막·사건 피드·상태 줄) 판정에서는
 * `null`과 똑같이 취급한다** — `scenarioStage !== null && scenarioStage !== 'ORDER_BASICS'`로
 * "이야기 UI를 그린다"를 판정하고, `ORDER_BASICS`에서는 그 자리에 목적 설명 한 줄만 남긴다.
 */
export type ScenarioStage =
  | 'IDLE_ENTRY'
  | 'ACT1'
  | 'ACT2'
  | 'IDLE_REENTRY'
  | 'ACT3'
  | 'ACT4'
  | 'FINISHED'
  | 'ORDER_BASICS'

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

/**
 * 대본이 안내하는 가격 변동 범위(049 ORDERBASICS-009~011, 이슈 #507). 극값에서 폭의 5%만큼
 * 안쪽으로 물린 뒤 안내 단위로 안쪽 반올림한 값이라 **차트에 실제로 찍히는 값보다 살짝 좁다** —
 * "대략 이 사이"라는 안내이지 정확한 상한·하한이 아니다.
 */
export interface PriceGuideRangeResponse {
  low: Decimal
  high: Decimal
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
  /**
   * **사건이 하나라도 있는 대본(041 이야기)은 항상 `null`이다** — 041의 폭락 극값을 미리 알려주면
   * 사건 공개 게이트를 뚫는다. 대본을 쓰지 않는 실행도 `null`. 그 대본 전체에 대한 고정값이라
   * tick으로 커서가 움직여도 값이 바뀌지 않는다.
   */
  priceGuideRange: PriceGuideRangeResponse | null
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
  /**
   * ⚠️ **화면에서 쓰지 않는다.** 자유 비율이 옛 프리셋 3개 중 하나와 **정확히 일치할 때만** 그
   * 식별자가 오고 그 밖에는 `null`이다(2026-08-21 재설계, 백엔드 확정). 이 값으로 이름을 그리면
   * 사용자가 고른 대부분의 조합에서 빈 칩이 된다 — 완료 화면은 아래 두 비율을 정본으로 읽는다.
   */
  exitPreset: PracticeExitPreset | null
  /**
   * **그 진입에 실제로 적용된** 손절·익절 비율(퍼센트 수, 둘 다 양수). 진입별로 고정된다 — 한 실행
   * 안에서도 재진입 사이에 비율을 다시 정할 수 있으므로 attempt의 현재 값과 다를 수 있고, 완료
   * 화면은 반드시 이 진입별 값을 써야 한다.
   *
   * ⚠️ **옵셔널인 이유는 계약이 아니라 배포 순서다** — 필드 이름과 "항상 non-null"은 2026-08-21에
   * 백엔드로 확인했고, 아직 **머지·배포 전**이라 옛 응답에는 없다. 없을 때 화면은 진입가와 기준선
   * 가격에서 되돌려 계산한다(EntryComparison). 배포를 확인하면 `?`와 그 폴백을 함께 뗀다.
   */
  stopLossRate?: number
  takeProfitRate?: number
  buyAt: LocalDateTimeString
  buyPrice: Decimal
  buyQuantity: Decimal
  /**
   * 그 진입을 **연** 매수의 주문 유형(이슈 #505). `buyQuantity`·`buyPrice`는 그 진입 구간의 매수를
   * 전부 합산한 값이라 기준이 다르다 — "이 수량을 무슨 방식으로 샀는가"가 아니라 "이 진입을 어떻게
   * 열었는가"로만 읽는다.
   */
  buyOrderType: OrderType
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
  /**
   * 이 진입이 열릴 때 attempt가 쓰던 대본(049 ORDERBASICS-023, 이슈 #512 "5-A"). **진입별로
   * 고정된다** — 2→3단계 전환(`advance-script`)은 같은 실행 세대 안에서 대본만 갈아끼우므로,
   * 전환 전에 연 진입과 전환 후에 연 진입이 같은 `entries[]`에 섞이고 서로 다른 값을 가질 수 있다.
   * 대본을 쓰지 않는 실행(생성기 버전 1·legacy)은 `null`이다.
   */
  scenarioScriptId: 'CRYPTO_ORDER_BASICS_V1' | 'CRYPTO_STORY_V1' | null
}

/**
 * 2단계(주문 방법) 판정(이슈 #503). **`null`이 되지 않는다** — attempt가 없는 경로·종목 미선택도
 * 세 값 모두 `false`인 객체로 온다. 판정 범위는 **현재 실행 세대**라 재시작하면 셋 다 `false`로
 * 돌아간다. **새로고침해도 서버가 다시 판정하므로, 화면은 이 값을 로컬로 세지 않고 그대로 그린다.**
 *
 * ⚠️ **`limitBuySellCompleted`는 주식(STOCK)에서 영원히 `false`다** — 지정가 주문 경로가 코인
 * 전용이라 주식 튜토리얼에는 이 단계를 통과할 수단이 없다. 진행 표시를 시장 구분 없이 쓰면 주식에서
 * 영원히 막힌 것처럼 보인다.
 *
 * **(049 ORDERBASICS-015~017, 이슈 #507) 이제 판정뿐 아니라 강제도 한다.** 대본을 쓰는 CRYPTO
 * 실행에서 시장가 왕복 전에 지정가 주문을 내거나, 지정가 왕복 전에 프리셋을 고르면 서버가 409
 * `PRACTICE_STAGE_LOCKED`로 거부한다 — 거부 본문에 이유가 안 실리므로(그 정보는 이미 이 값에 있다)
 * 화면이 이 값으로 미리 판단해 버튼을 잠그거나 이유를 붙여야 한다. 강제 대상은 대본을 쓰는 CRYPTO
 * 실행뿐이고 STOCK·시장가 주문은 항상 통과한다.
 */
export interface TutorialStageProgress {
  /** 이 실행에 시장가 매수 체결이 있고, **사용자가 낸** 시장가 매도 체결도 있다. */
  marketBuySellCompleted: boolean
  /** 이 실행에 지정가 매수와 지정가 매도가 둘 다 있다. 주식은 항상 false. */
  limitBuySellCompleted: boolean
  /**
   * 이 실행에서 손절·익절 기준을 직접 정했는가. 프리셋이 자유 입력으로 바뀐 뒤에도 **이름·의미가
   * 그대로다** — 판정만 넓어져 프리셋이든 자유 비율이든 한 번이라도 정하면 `true`이고,
   * `PUT .../exit-rates` 호출로도 `true`가 된다(2026-08-21 백엔드 확인 완료, 개명 없음).
   */
  exitPresetSelected: boolean
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
  /** 2단계 판정(이슈 #503). null이 되지 않는다 — 위 타입 설명을 반드시 먼저 읽는다. */
  tutorialStageProgress: TutorialStageProgress
  /**
   * 손절·익절 비율 입력의 허용 범위(2026-08-21 재설계). **아직 안 내려주는 서버가 있어 옵셔널이다** —
   * 없으면 화면이 `FALLBACK_EXIT_RATE_BOUNDS`로 대신 그린다.
   *
   * 서버는 같은 값을 `attempt` 안에도 싣는다(쓰기 경로 네 곳은 `PracticeAttemptResponse`만 돌려주기
   * 때문이다). 화면은 **루트만 읽는다** — attempt가 없는 legacy 경로에서도 루트는 non-null이라
   * 한 곳만 보면 되고, 두 곳을 다 읽으면 어느 쪽이 정본인지가 흐려진다(2026-08-21 백엔드 확인).
   */
  exitRateBounds?: ExitRateBounds
}
