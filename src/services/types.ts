// 백엔드 실제 응답 계약에 1:1 대응하는 도메인 타입 정의 (모든 성공 응답은 봉투 없는 bare JSON)

/* ---------- 공통 ---------- */

export type Market = 'STOCK' | 'CRYPTO'

/**
 * 백엔드 LocalDateTime 직렬화 문자열. 예: "2026-07-29T09:01:00" — 오프셋·Z 가 없다.
 * 절대 'Z' 를 붙이지 말 것. 파싱은 lib/datetime.ts 의 parseLocalDateTime 을 쓴다.
 */
export type LocalDateTimeString = string
/** 백엔드 LocalDate 직렬화 문자열. 예: "2026-07-29" */
export type LocalDateString = string

/**
 * BigDecimal 은 JSON 숫자로 내려온다. 같은 값이 엔드포인트마다 다른 scale 로 온다
 * (POST /api/orders → 10, GET /api/orders → 10.00000000). 문자열 비교 금지, 항상 숫자로 비교한다.
 */
export type Decimal = number

/** 백엔드 공통 오류 봉투 — 성공 응답에는 봉투가 없다. */
export interface ApiErrorEnvelope {
  error: { code: string; message: string; requestId: string }
}

/* ---------- 인증 ---------- */

export type SignupMethod = 'EMAIL' | 'KAKAO' | 'NAVER'

/** GET /api/auth/oauth/{provider}/... — 백엔드는 대소문자 무관하게 받지만 소문자로 통일한다. */
export type OAuthProvider = 'kakao' | 'naver'

/** GET /api/auth/me — role 필드가 없다. 클라이언트 관리자 개념은 존재할 수 없다. */
export interface Member {
  id: number
  email: string
  nickname: string
  signupMethod: SignupMethod
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresInSeconds: number
  refreshTokenExpiresInSeconds: number
}

export interface EmailVerificationRequest {
  email: string
}
/** code 는 정확히 6자리 숫자 */
export interface EmailVerificationConfirmRequest {
  email: string
  code: string
}
export interface EmailVerificationConfirmResponse {
  signupVerificationToken: string
  expiresInSeconds: number
}

/** POST /api/auth/signup — 201 로 TokenResponse 를 돌려주며 그대로 로그인된다. 가입 시 STOCK·CRYPTO 계좌가 동시 생성된다. */
export interface SignupRequest {
  email: string
  nickname: string
  password: string
  termsAgreed: true
  signupVerificationToken: string
}

export interface LoginRequest {
  email: string
  password: string
}
export interface RefreshRequest {
  refreshToken: string
}
export interface LogoutRequest {
  refreshToken: string
}

/** 서버가 DB 의 가입 방식으로 필요한 재인증 수단을 판단한다 (EMAIL → currentPassword). */
export interface NicknameChangeRequest {
  nickname: string
  currentPassword?: string
  reauthToken?: string
}
export interface EmailChangeRequest {
  newEmail: string
  currentPassword?: string
  reauthToken?: string
}
export interface EmailChangeConfirmRequest {
  newEmail: string
  code: string
}

/* ---------- 종목·시세 ---------- */

/**
 * GET /api/instruments — bare array. Flyway 시드 28건(id 1~16 STOCK, 17~28 CRYPTO) +
 * 튜토리얼 전용 샘플 종목 6건(시장당 3개, 031). isTutorialSample 종목 중 tradable=false인
 * 2개는 목록에 노출되지만 즐겨찾기·매수·매도 대상에서 배제된다(즐겨찾기 등록만 명시 거부, 나머지는
 * 애초에 선택 UI에서 막는다).
 */
export interface Instrument {
  instrumentId: number
  market: Market
  symbol: string
  name: string
  tickSize: Decimal
  minOrderAmount: number
  tradable: boolean
  isTutorialSample: boolean
}

export type PriceStatus = 'AVAILABLE' | 'UNAVAILABLE'
export type MarketStatus = 'OPEN' | 'CLOSED'

/** GET /api/instruments/{id}/price — 가격이 없으면 200 이 아니라 409 PRICE_UNAVAILABLE 이다. */
export interface PriceResponse {
  price: Decimal | null
  sourceTime: LocalDateTimeString | null
  status: PriceStatus
  sourceTradingDate: LocalDateString | null
}

/**
 * 캔들 주기. **대소문자를 구분하며 `1m`(분)과 `1M`(월)은 다른 값이다.**
 * 잘못된 값은 종목 존재 검증보다 먼저 걸러져 404 가 아니라 400 이 된다.
 */
export type CandleInterval = '1m' | '1d' | '1w' | '1M'

/**
 * GET /api/instruments/{id}/candles?interval= — bare array, sourceTime 오름차순, 최대 200개.
 * 주식 `1m`: 미마감 분봉 **제외**, from·to 의 날짜 성분은 무시(시각만 사용).
 *   sourceTime 의 날짜는 오늘이 아니라 원본 거래일(sourceTradingDate)이다.
 * 주식 집계(`1d`·`1w`·`1M`): 진행 중 버킷 **포함**(1m 과 정반대), from·to 는 날짜만 사용.
 *   sourceTime 은 버킷 시작일 00:00:00 이며 그 날이 거래일이 아닐 수도 있다(라벨 용도).
 *   거래일이 없는 주·월은 응답에서 아예 빠져 달력 연속성이 없다.
 * 코인: 진행 중 봉 포함, from·to 는 전체 datetime. 재생세션 미준비 시 200 [] (정상).
 */
export interface Candle {
  sourceTime: LocalDateTimeString
  open: Decimal
  high: Decimal
  low: Decimal
  close: Decimal
  volume: Decimal
}

/* ---------- SSE (GET /api/stocks/stream, Bearer 필수 → EventSource 사용 불가) ---------- */

export interface StreamPriceSnapshot {
  symbol: string
  price: Decimal | null
  sourceTime: LocalDateTimeString | null
  status: PriceStatus
}

/** event: snapshot — 구독 직후 1회. 주식 16종이 항상 전부 포함된다. */
export interface StockSnapshotEvent {
  market: 'STOCK'
  sourceTradingDate: LocalDateString | null
  marketStatus: MarketStatus
  emittedAt: LocalDateTimeString
  prices: StreamPriceSnapshot[]
}

/** event: price — 매분 새로 공개된 종목만. */
export interface StockPriceEvent {
  market: 'STOCK'
  symbol: string
  price: Decimal
  sourceTime: LocalDateTimeString
  emittedAt: LocalDateTimeString
  sourceTradingDate: LocalDateString | null
  marketStatus: MarketStatus
}

/** event: status — marketStatus 가 바뀔 때만. */
export interface StockStatusEvent {
  market: 'STOCK'
  marketStatus: MarketStatus
  emittedAt: LocalDateTimeString
}

/* ---------- 주문·체결 ---------- */

export type OrderSide = 'BUY' | 'SELL'

/**
 * `POST /api/orders`(시장가)는 `MARKET` 만 받는다 — `LIMIT` 을 보내면 422 UNSUPPORTED_ORDER_TYPE.
 * 지정가는 전용 경로 `POST /api/orders/limit` 이며 `orderType` 을 아예 보내지 않는다(항상 LIMIT).
 */
export type OrderType = 'MARKET' | 'LIMIT'

/**
 * 시장가는 PENDING 을 거치지 않고 즉시 FILLED 다. 지정가는 생성 시 항상 PENDING 이고
 * FILLED·CANCELLED 는 종단 상태다(재전이 시 409 ORDER_ALREADY_FILLED / ORDER_ALREADY_CANCELLED).
 * 부분체결·부분취소·만료가 없어 중간 상태가 존재하지 않는다.
 */
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED'

/** POST /api/orders — Idempotency-Key 헤더 필수(공백 불가, 100자 이하, 사용자별 유일). quantity 는 문자열로 보낸다. */
export interface OrderCreateRequest {
  market: Market
  instrumentId: number
  side: OrderSide
  orderType: OrderType
  quantity: string
}

/** POST /api/orders 201 — 시장가는 즉시 체결되어 주문+체결 결과가 한 번에 온다. */
export interface OrderExecutionResponse {
  orderId: number
  market: Market
  instrumentId: number
  side: OrderSide
  orderType: OrderType
  status: OrderStatus
  quantity: Decimal
  requestedAt: LocalDateTimeString
  tradeId: number
  price: Decimal
  amount: Decimal
  fee: Decimal
  /** BUY 는 항상 null */
  realizedPnl: Decimal | null
  executedAt: LocalDateTimeString
}

/**
 * GET /api/orders 와 GET /api/orders/pending 의 공통 항목 타입 — 9필드 고정.
 * symbol·name 이 없어 instrumentService 캐시로 조인해야 한다.
 * 체결 전용 필드(tradeId·price·amount·fee·executedAt)는 어떤 이름으로도 오지 않는다 —
 * "무엇을 요청했는가"와 "얼마에 체결됐는가"를 두 API 가 분리한다(체결가는 GET /api/trades).
 */
export interface OrderSummary {
  orderId: number
  market: Market
  instrumentId: number
  side: OrderSide
  orderType: OrderType
  status: OrderStatus
  quantity: Decimal
  /** 시장가 주문은 항상 null. 지정가는 값이 있고 체결가 == limitPrice 다(체결가가 지정가로 고정된다). */
  limitPrice: Decimal | null
  requestedAt: LocalDateTimeString
}

/**
 * GET /api/orders?market=&cursor=&limit= 와 GET /api/orders/pending 이 같은 봉투를 쓴다.
 * market 은 **필수**다. cursor 는 `{requestedAt}_{orderId}` 이며 직접 조립하지 않고
 * 이전 응답의 nextCursor 를 그대로 되돌려 보낸다. 마지막 페이지 판정은 hasNext === false.
 * limit 기본 20, 1~100, 범위 밖은 클램핑 없이 400 이다(GET /api/rankings 와 의도적으로 다르다).
 */
export interface OrderPage {
  content: OrderSummary[]
  nextCursor: string | null
  hasNext: boolean
}

/* ---------- 지정가 주문 (LMT-001~005, 코인 전용) ---------- */

/**
 * POST /api/orders/limit — 4필드 전부 필수, `orderType` 은 보내지 않는다(항상 LIMIT).
 * market 은 CRYPTO 만 허용하며 STOCK 은 400 VALIDATION_ERROR 다
 * (POST /api/orders 의 422 UNSUPPORTED_ORDER_TYPE 과 다른 코드다 — 혼동 금지).
 * quantity 는 소수점 8자리 이하, quantity × limitPrice 가 최소주문금액 5,000원 이상이어야 한다.
 *
 * Idempotency-Key 헤더 필수. **해시 필드 목록이 문서에 없다** — 서버가 limitPrice 를 빼먹었을 경우
 * 가격만 다른 두 주문이 조용히 첫 응답으로 replay 될 수 있다. 그래서 키를 limitPrice 포함
 * 전체 본문에서 파생시키고, 201 응답의 limitPrice·quantity 가 요청과 같은지 검증한다.
 */
export interface LimitOrderCreateRequest {
  market: 'CRYPTO'
  instrumentId: number
  side: OrderSide
  /** 문자열로 보낸다 (부동소수 오차 회피) */
  quantity: string
  limitPrice: string
}

/**
 * PATCH /api/orders/{orderId} — 두 필드 모두 생략 가능한 부분 갱신이지만
 * **둘 다 생략하면 400** 이다. market·side·instrumentId 는 수정할 수 없다.
 * Idempotency-Key 불필요(절대값 지정이라 자연 멱등).
 * 수정 이력은 저장되지 않으므로 되돌리기가 필요하면 클라이언트가 이전 값을 들고 있어야 한다.
 */
export interface LimitOrderUpdateRequest {
  quantity?: string
  limitPrice?: string
}

/**
 * POST /api/orders/limit 201 과 PATCH /api/orders/{orderId} 200 이 공유하는 타입 — 9필드 고정.
 * 생성·수정 모두 status 는 항상 PENDING 이고, 즉시체결 조건을 충족해도 거부되지 않는다
 * (체결은 서버 내부 LMT-002 가격 트리거에서만 발생한다).
 * PATCH 는 orderId·requestedAt 을 유지하므로 목록 정렬 위치가 바뀌지 않는다.
 * 체결 정보(tradeId·price·amount·fee·realizedPnl·executedAt)는 포함되지 않는다.
 */
export interface LimitOrderResponse {
  orderId: number
  market: 'CRYPTO'
  instrumentId: number
  side: OrderSide
  orderType: 'LIMIT'
  status: 'PENDING'
  quantity: Decimal
  limitPrice: Decimal
  requestedAt: LocalDateTimeString
}

/* ---------- 관심목록 (WATCH-001~003) ---------- */

/** POST /api/watchlist-items — instrumentId 하나뿐이다. market 을 본문에 보내지 않는다. */
export interface WatchlistItemCreateRequest {
  instrumentId: number
}

/**
 * POST 201 과 GET 목록 항목이 같은 타입이다.
 * market·symbol·name 이 들어 있어 **instrumentService 캐시 조인이 필요 없다**
 * (GET /api/orders·/api/trades 와 다르다). 다만 tradable·tickSize·현재가는 없으므로
 * "거래정지" 배지나 최소주문금액 표시에는 여전히 캐시가 필요하다.
 */
export interface WatchlistItem {
  /** 관심목록 항목 PK — 종목 id 와 다르다. **삭제 경로 변수는 이 값이 아니라 instrumentId 다.** */
  watchlistItemId: number
  instrumentId: number
  market: Market
  symbol: string
  name: string
  createdAt: LocalDateTimeString
}

/**
 * GET /api/watchlist-items?market= (market 선택, 생략 시 전체).
 * `{content}` 봉투 하나뿐이고 커서·페이지 필드가 없다 — 페이지네이션 UI 를 만들지 않는다.
 * 정렬은 createdAt DESC, watchlistItemId DESC 로 서버가 보장하므로 프론트에서 재정렬하지 않는다
 * (낙관적 추가는 맨 앞에 끼워야 서버 순서와 맞는다).
 */
export interface WatchlistItemList {
  content: WatchlistItem[]
}

/* ---------- 체결 ---------- */

/** GET /api/trades — symbol·name 없음. instrumentService 캐시로 조인한다. */
export interface Trade {
  tradeId: number
  instrumentId: number
  side: OrderSide
  price: Decimal
  quantity: Decimal
  amount: Decimal
  fee: Decimal
  realizedPnl: Decimal | null
  executedAt: LocalDateTimeString
}

/** cursor 형식: `{ISO_LOCAL_DATE_TIME}_{tradeId}`. limit 기본 20, 1..100 (서버가 클램프하지 않고 400 을 낸다). */
export interface TradePage {
  content: Trade[]
  nextCursor: string | null
  hasNext: boolean
}

/* ---------- 보유·계좌 ---------- */

/**
 * GET /api/holdings?market= (market 필수). bare array, symbol 오름차순.
 * priceStatus 가 UNAVAILABLE 이면 currentPrice·evaluationAmount·unrealizedPnl·returnRate 가 명시적 null 이다.
 * (계좌 요약은 같은 상황에서 원가로 폴백해 채운다 — 의도된 차이라 두 화면 숫자가 안 맞아 보일 수 있다.)
 */
export interface Holding {
  instrumentId: number
  symbol: string
  name: string
  /** 총 보유수량 — 예약분이 차감되어 있지 않다. */
  quantity: Decimal
  /** 코인 지정가 매도로 예약된 수량. 주문 가능 수량은 quantity - reservedQuantity 로 직접 계산한다. */
  reservedQuantity: Decimal
  averagePrice: Decimal
  currentPrice: Decimal | null
  evaluationAmount: Decimal | null
  unrealizedPnl: Decimal | null
  returnRate: Decimal | null
  priceStatus: PriceStatus
}

/**
 * GET /api/accounts/summary?market= (market 필수). 7필드 고정.
 * returnRate 는 퍼센트가 아니라 scale-4 비율이다 (0.0020 == 0.20%). 화면 표시 시 ×100 필수.
 */
export interface AccountSummary {
  /** 현금잔고 — 예약분이 차감되어 있지 않다. */
  cashBalance: Decimal
  /**
   * 코인 지정가 매수로 예약된 현금. 정수 금액(long)이며 BigDecimal 이 아니다.
   * `availableCash` 는 서버가 주지 않는다 — cashBalance - reservedCash 로 직접 계산한다(확정 정책).
   */
  reservedCash: number
  holdingsValue: Decimal
  /** cashBalance + holdingsValue — reservedCash 를 빼지 않는다. */
  totalValue: Decimal
  realizedPnl: Decimal
  unrealizedPnl: Decimal
  returnRate: Decimal
}

/** GET /api/portfolio — 파라미터 없음. 두 시장 합산이므로 분모는 20,000,000 이다. returnRate 도 비율. */
export interface PortfolioTotal {
  totalValue: Decimal
  returnRate: Decimal
  unrealizedPnl: Decimal
  realizedPnl: Decimal
}

/* ---------- 투자일기 (JOUR-001~006) ---------- */

export type JournalType = 'BUY' | 'SELL'

/**
 * GET /api/journal 항목 — 6필드 고정. 매수·매도 회고를 한 목록으로 병합해 준다.
 *
 * 통합 journalId 가 **목록에는 없다.** 항목의 유일 키는 journalType + 해당 타입의 체결 ID이며
 * React key 는 `${journalType}-${buyTradeId ?? sellTradeId}` 로 조합해야 한다.
 * 종목·가격·수량·실현손익은 이 응답에 **없다** — 필요하면 GET /api/trades 와 체결 ID로 조인한다.
 * updatedAt === createdAt 이면 미수정이다(별도 isEdited 플래그가 없다).
 */
export interface JournalListItem {
  journalType: JournalType
  /** journalType === 'BUY' 일 때만 값. SELL 항목은 null */
  buyTradeId: number | null
  /** journalType === 'SELL' 일 때만 값. BUY 항목은 null */
  sellTradeId: number | null
  content: string
  createdAt: LocalDateTimeString
  updatedAt: LocalDateTimeString
}

/**
 * cursor 형식은 `{createdAt}_{체결 ID}`. 정렬은 createdAt 내림차순 + 동시각 체결 ID 내림차순이며
 * updatedAt 기준이 아니다(수정한 오래된 항목이 위로 튀지 않는다).
 * limit 기본 20, 1~100, **클램핑 없이 400** — GET /api/rankings 와 정반대다.
 * 요청 시장의 계좌가 없으면 404 다. 빈 목록(200)과 다르므로 뭉개면 안 된다.
 */
export interface JournalPage {
  content: JournalListItem[]
  nextCursor: string | null
  hasNext: boolean
}

/**
 * GET /api/journal/buy/{buyTradeId} — 5필드 고정. 경로 변수는 회고 PK 가 아니라 **체결 ID** 다.
 * journalId 는 매수·매도 테이블의 AUTO_INCREMENT 가 별개라 두 타입 간 값이 겹칠 수 있다 → 단독 키 금지.
 */
export interface BuyJournalDetail {
  journalId: number
  buyTradeId: number
  content: string
  createdAt: LocalDateTimeString
  updatedAt: LocalDateTimeString
}

/** GET /api/journal/sell/{sellTradeId} — 매수 상세와 완전 대칭이다. */
export interface SellJournalDetail {
  journalId: number
  sellTradeId: number
  content: string
  createdAt: LocalDateTimeString
  updatedAt: LocalDateTimeString
}

/**
 * 작성·수정 공통 본문. content 는 @NotBlank + 최대 5000자이며 서버가 트림하지 않는다.
 * POST 201 응답에는 updatedAt 이 **없고**, PATCH 200 응답에만 있다.
 * PATCH 는 upsert 가 아니라 회고가 없으면 404 다.
 */
export interface JournalWriteRequest {
  content: string
}

/* ---------- 랭킹 (RANK-001·002) ---------- */

/**
 * GET /api/rankings 항목. userId 가 없어 "내 순위 하이라이트"는 nickname 문자열 비교뿐이다.
 * nickname 은 마스킹 없이 전체 노출되므로 클라이언트에서 임의로 가리면 /rankings/me 와 대조가 깨진다.
 */
export interface RankingEntry {
  /**
   * 동점자는 공동 순위이고 다음 순위를 건너뛴다(1,1,3).
   * **배열 인덱스와 다르며 값이 중복된다** — index+1 로 그리거나 React key 로 쓰면 안 된다.
   */
  rank: number
  nickname: string
  /** 금액이다. 이 도메인에는 scale-4 비율 필드가 하나도 없어 ratioToPercent 를 쓸 대상이 없다. */
  realizedPnl: Decimal
}

/**
 * GET /api/rankings?market=&limit= — 2단 구조이고 커서 필드가 없다.
 * limit 은 이 API 만 **클램핑**된다(생략·0 이하 → 10, 51 이상 → 50). 다른 목록의 400 정책과 정반대라
 * 공용 클램프 유틸을 공유하면 서버 기본값 10 이 가려진다.
 */
export interface RankingList {
  market: Market
  content: RankingEntry[]
}

/**
 * GET /api/rankings/me?market= — **flat 구조다**(content 래핑 없음). 목록과 형태가 다르다.
 * 매도 이력이 없으면 rank 만 null 이고 nickname·realizedPnl(0)은 항상 값이 있다 —
 * rank === null 을 "응답이 비었다"로 해석해 빈 상태를 그리면 정보를 버리게 된다.
 * realizedPnl 은 Redis ZSET score 기반이라 GET /api/accounts/summary 의 값과 순간적으로 어긋날 수 있다.
 */
export interface MyRanking {
  market: Market
  rank: number | null
  nickname: string
  realizedPnl: Decimal
}

/* ---------- 커뮤니티 ---------- */

/**
 * 목록도 content 를 전부 포함한다. authorId 가 없어 소유 판정은 authorNickname 비교뿐이다.
 * 종목 태그 3필드는 항상 셋 다 값이거나 셋 다 null 이며, symbol·name 이 함께 오므로
 * 배지를 그리는 데 instrumentService 캐시 조인이 필요 없다.
 */
export interface Post {
  postId: number
  authorNickname: string
  title: string
  content: string
  /** 태그된 종목. 게시물당 최대 1개이며 미태그면 null */
  instrumentId: number | null
  instrumentSymbol: string | null
  instrumentName: string | null
  createdAt: LocalDateTimeString
  updatedAt: LocalDateTimeString
}

export interface PostPage {
  content: Post[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

/** title 최대 100자, content 최대 5000자. instrumentId 는 선택이며 미태그면 생략한다. */
export interface PostCreateRequest {
  title: string
  content: string
  instrumentId?: number | null
}

/**
 * PATCH 는 부분 수정이 아니라 전체 교체 — 두 필드 모두 필수.
 *
 * **instrumentId 를 생략하거나 null 로 보내면 기존 태그가 해제된다(계약 명시).**
 * 제목만 고치는 요청도 태그를 지우므로 수정 폼은 기존 post.instrumentId 를 초기값으로 실어
 * 반드시 함께 재전송해야 한다. 변경 이력이 없어 되돌릴 수 없다.
 */
export interface PostUpdateRequest {
  title: string
  content: string
  instrumentId?: number | null
}

/**
 * GET /api/community/posts/{id}/comments — bare array, 페이지네이션·수정 API 없음.
 * 최상위 배열에는 **부모 댓글만** 들어가고 대댓글은 각 부모의 replies 에 중첩된다.
 * 정렬은 양쪽 모두 createdAt 오름차순 + commentId 오름차순이다.
 * 중첩은 1단계뿐이라 **대댓글의 replies 는 항상 빈 배열**이고, 대댓글에 답글을 달면 400 이다.
 * 부모를 삭제하면 자식 대댓글도 CASCADE 로 함께 사라진다(타인 것이라도).
 */
export interface Comment {
  commentId: number
  authorNickname: string
  content: string
  createdAt: LocalDateTimeString
  /** 부모 댓글은 null, 대댓글은 부모의 commentId */
  parentCommentId: number | null
  /** 부모와 완전히 같은 Comment 타입이다(축소 타입이 아니다). 자식이 없으면 [] */
  replies: Comment[]
}

/**
 * content 최대 1000자. parentCommentId 를 주면 그 댓글의 대댓글이 된다.
 * 부모가 이미 대댓글이면 400, 존재하지 않거나 다른 게시물 소속이면 404 다 —
 * 이 404 를 "게시물이 사라졌다"로 해석하면 안 된다.
 */
export interface CommentCreateRequest {
  content: string
  parentCommentId?: number | null
}
