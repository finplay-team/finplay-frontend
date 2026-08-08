// AI 피드백(FEED-006~011) 전용 응답 타입. post-sell 한 건만도 4단 중첩이라 services/types.ts 에 넣으면
// 공용 파일이 이 도메인만으로 배가 되고, 같은 파일을 건드리는 다른 작업과 충돌하므로 여기로 분리했다.
import type { Decimal, LocalDateString, LocalDateTimeString, Market } from './types'

/* ---------- 공통 ---------- */

/**
 * spec 012 의 `PostSellFeedbackStatus` 는 **4값짜리 단일 열거형**이며
 * `postSellFlow.status`·`counterfactuals.status`·`peerComparison.status`·`narrativeStatus` 가 이것을 공유한다.
 * 자리마다 실제로 나오는 값의 범위가 다른 것은 판정 로직 차이일 뿐 타입 차이가 아니다
 * (예: `narrativeStatus` 는 템플릿 폴백이 있어 항상 `READY`, `NO_EVENT` 는 `peerComparison` 에서만 난다).
 */
export type PostSellFeedbackStatus = 'READY' | 'NOT_YET' | 'INSUFFICIENT_SAMPLE' | 'NO_EVENT'

export type FeedbackItemType = 'NEWS' | 'DISCLOSURE'

/**
 * 카드 근거 출처. `publisher` 는 한글 언론사명이 아니라 **원문 도메인**(`hankyung.com`)이고
 * 공시는 `DART` 고정이다. 오타가 아니라 계약이므로 화면에 그대로 노출한다(한글 매핑은 백엔드 후속 이슈).
 */
export interface FeedbackSource {
  type: FeedbackItemType
  title: string
  publisher: string
  url: string
  /** 공시는 시각 부분이 항상 00:00:00 이다. */
  publishedAt: LocalDateTimeString
}

/* ---------- FEED-006 GET /api/instruments/{id}/price-moves ---------- */

export type PriceMoveEventType = 'INTRADAY' | 'OPENING_GAP'

export interface PriceMove {
  id: number
  eventType: PriceMoveEventType
  /** 조회한 날짜가 아니라 originTradeDate 의 날짜가 붙는다. */
  windowStart: LocalDateTimeString
  windowEnd: LocalDateTimeString
  /** scale-4 비율. -0.0182 == -1.82% */
  changeRate: Decimal
  /** LLM 또는 템플릿. 어느 쪽이든 항상 채워진다. */
  narrative: string
  /** 근거 없는 카드는 생성되지 않으므로 길이 >= 1 이다. */
  sources: FeedbackSource[]
}

/**
 * 넷 중 유일하게 **status enum 이 없다.** `originTradeDate=null` 은
 * "재생세션 미준비(주식)"와 "코인" 둘 다를 뜻하므로 종목의 `market` 을 따로 알아야 문구를 고를 수 있다.
 */
export interface PriceMoveListResponse {
  originTradeDate: LocalDateString | null
  moves: PriceMove[]
}

/* ---------- FEED-007/010/011 GET /api/ai/post-sell/{tradeId} ---------- */

/** post-sell 안의 카드는 FEED-006 과 같은 카드지만 필드 구성이 다르다 — `eventType` 이 없고 분 단위 두 필드가 있다. */
export interface PostSellPriceMove {
  id: number
  windowStart: LocalDateTimeString
  windowEnd: LocalDateTimeString
  changeRate: Decimal
  minutesAfterBuy: number
  minutesBeforeSell: number
  narrative: string
  sources: FeedbackSource[]
}

/** `status='NOT_YET'` 이면 가격 필드가 전부 null 이다. 객체 자체가 null 인 것(=sameSessionCompleted:false)과 다른 상태다. */
export interface PostSellFlow {
  status: PostSellFeedbackStatus
  closePrice: number | null
  closeAt: LocalDateTimeString | null
  /** scale-4 비율 */
  sellToCloseRate: Decimal | null
  postSellHighPrice: number | null
  postSellHighAt: LocalDateTimeString | null
}

/** `returnRate` 는 시나리오 가격마다 수수료를 다시 계산한 값이다. 클라이언트에서 재계산하면 서버 값과 어긋난다. */
export interface CounterfactualScenario {
  price: number
  at: LocalDateTimeString
  /** scale-4 비율 */
  returnRate: Decimal
}

/**
 * 배열이 아니라 **고정 키 3개짜리 객체**다. 시나리오 식별자가 곧 키 이름이라 `.map()` 이 아니라 키 접근을 쓴다.
 * `status='NOT_YET'` 일 때 세 값이 null 인지 내부 필드가 null 인지는 계약 문서에 없어 nullable 로 둔다.
 */
export interface Counterfactuals {
  status: PostSellFeedbackStatus
  atClose: CounterfactualScenario | null
  atHoldHigh: CounterfactualScenario | null
  atFirstMoveAfterBuy: CounterfactualScenario | null
}

/**
 * 게이트 축이 위 둘과 다르다 — `postSellFlow`·`counterfactuals` 는 **시각**(그 체결의 서비스 날짜 15:30),
 * 이쪽은 **확정 집계 행의 존재**다. 그래서 `postSellFlow=READY` + `peerComparison=NOT_YET` 중간 상태가 실재한다.
 */
export interface PeerComparison {
  status: PostSellFeedbackStatus
  /** NO_EVENT 면 이것까지 null 이다 — priceMoves 조회 키로 쓰기 전에 반드시 확인한다. */
  priceMoveId: number | null
  /** INSUFFICIENT_SAMPLE(5 미만)이면 null */
  holderCount: number | null
  /** 비율이다(0.38 == 38%). INSUFFICIENT_SAMPLE 이면 null */
  soldWithin30MinRate: Decimal | null
  medianMinutesToSell: number | null
  /** 모집단 통계가 아니라 본인 값이라 INSUFFICIENT_SAMPLE 에서도 채워진다. */
  yourMinutesToSell: number | null
}

export type NarrativeSource = 'LLM' | 'TEMPLATE'

export interface PostSellFeedbackResponse {
  tradeId: number
  instrumentId: number
  /** 이 응답에는 symbol·name 이 있다 — instrument 캐시 조인이 필요 없다. */
  symbol: string
  name: string
  /** 배분된 매수 lot 중 **가장 이른** 체결 시각. 오늘이 아니라 원본 거래일 축이며 초를 포함한다. */
  buyAt: LocalDateTimeString
  /** 매도 체결 시각. 원본 거래일 축, 초 포함. */
  sellAt: LocalDateTimeString
  /** FIFO 배분 **가중평균** 매수단가. 단일 lot 가격이 아니다. */
  buyPrice: number
  sellPrice: number
  quantity: number
  fee: number
  realizedPnl: number
  /** scale-4 비율 */
  returnRate: Decimal
  /** sameSessionCompleted=false 라고 null 이 되지 않는다. `sellAt < buyAt` 역전인 경우에만 null 이다. */
  holdingMinutes: number | null
  /** 응답 형태를 가르는 스위치. false 면 아래 파생 필드가 전부 null 이고 priceMoves 만 [] 다. */
  sameSessionCompleted: boolean

  holdHighPrice: number | null
  holdHighAt: LocalDateTimeString | null
  holdLowPrice: number | null
  holdLowAt: LocalDateTimeString | null
  /** scale-4 비율 */
  sellVsHighRate: Decimal | null
  /** scale-4 비율 */
  sellVsLowRate: Decimal | null
  /** 양수면 매수가 기사보다 앞섰다는 뜻. 근거 기사가 없으면 sameSessionCompleted=true 여도 null 이다. */
  buyToNewsMinutes: number | null

  /** sameSessionCompleted=false 면 null 이 아니라 [] 다. */
  priceMoves: PostSellPriceMove[]

  postSellFlow: PostSellFlow | null
  counterfactuals: Counterfactuals | null
  peerComparison: PeerComparison | null

  /** 항상 채워진다. 다만 재생성이 있어 같은 tradeId 를 다시 조회하면 문장이 바뀔 수 있다. */
  narrative: string
  narrativeSource: NarrativeSource
  /** 실질적으로 항상 'READY'. 템플릿 폴백이 있어 UNAVAILABLE 이 존재하지 않는다. */
  narrativeStatus: PostSellFeedbackStatus
}

/* ---------- FEED-008 GET /api/instruments/{id}/news ---------- */

export type SummaryScope = 'PRE_MARKET' | 'FULL' | 'ROLLING_24H'

/** Part C 전용. 브리핑(Part D)과 값 집합은 같아도 **같은 상황에 다른 값**이 나오므로 타입을 공유하지 않는다. */
export type NewsSummaryStatus = 'READY' | 'NOT_YET' | 'EMPTY' | 'UNAVAILABLE'

/** 종목 단위 조회라 instrumentId·symbol·name 이 없다. 브리핑 아이템과 합치면 안 되는 이유다. */
export interface InstrumentNewsItem {
  type: FeedbackItemType
  title: string
  publisher: string
  url: string
  publishedAt: LocalDateTimeString
}

export interface InstrumentNewsResponse {
  /** 주식 재생세션 미준비면 null. 개장 전(09:00 이전)에는 채워진다. 코인은 항상 null. */
  originTradeDate: LocalDateString | null
  summaryScope: SummaryScope | null
  summaryStatus: NewsSummaryStatus
  summary: string | null
  /** **EMPTY(행 없음)·UNAVAILABLE 에서도 채워진다.** status 로 목록을 숨기면 안 된다. */
  items: InstrumentNewsItem[]
}

/* ---------- FEED-009 GET /api/market/briefing?market= ---------- */

/** Part D 전용. 필드 이름도 `summaryStatus` 가 아니라 `status` 다. */
export type BriefingStatus = 'READY' | 'NOT_YET' | 'EMPTY' | 'UNAVAILABLE'

/** 전 종목 합산 단일 목록이라 종목 정보 3필드가 아이템에 실려 온다 — 브리핑에만 있다. */
export interface BriefingItem {
  instrumentId: number
  symbol: string
  name: string
  type: FeedbackItemType
  title: string
  publisher: string
  url: string
  publishedAt: LocalDateTimeString
}

export interface MarketBriefingResponse {
  market: Market
  /** 주식 재생세션 미준비면 null(이때 status 는 NOT_YET 이 아니라 EMPTY 다). 코인은 항상 null. */
  originTradeDate: LocalDateString | null
  status: BriefingStatus
  summary: string | null
  /** 뉴스 목록과 같다 — EMPTY(행 없음)·UNAVAILABLE 에서도 채워진다. */
  items: BriefingItem[]
}
