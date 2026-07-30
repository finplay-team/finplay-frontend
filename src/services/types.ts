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

/** GET /api/instruments — bare array. Flyway 시드 28건 (id 1~16 STOCK, 17~28 CRYPTO). */
export interface Instrument {
  instrumentId: number
  market: Market
  symbol: string
  name: string
  tickSize: Decimal
  minOrderAmount: number
  tradable: boolean
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
 * GET /api/instruments/{id}/candles?interval=1m — bare array, sourceTime 오름차순.
 * 주식: 미마감 분봉 제외, from·to 의 날짜 성분은 무시(시각만 사용), 재생세션 미준비 시 200 [] (정상).
 *       sourceTime 의 날짜는 오늘이 아니라 원본 거래일(sourceTradingDate)이다.
 * 코인: 진행 중 분봉 포함, 최대 200개.
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
/** MARKET 만 지원한다. 그 외 값은 422 UNSUPPORTED_ORDER_TYPE. 지정가·미체결 주문 개념은 없다. */
export type OrderType = 'MARKET'
export type OrderStatus = 'FILLED'

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

/** GET /api/orders — bare array. symbol·name 이 없어 instrumentService 캐시로 조인해야 한다. */
export interface OrderSummary {
  orderId: number
  market: Market
  instrumentId: number
  side: OrderSide
  orderType: OrderType
  status: OrderStatus
  quantity: Decimal
  requestedAt: LocalDateTimeString
}

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

/** GET /api/holdings?market= (market 필수). priceStatus 가 UNAVAILABLE 이면 아래 4개 필드가 명시적 null 이다. */
export interface Holding {
  instrumentId: number
  symbol: string
  name: string
  quantity: Decimal
  averagePrice: Decimal
  currentPrice: Decimal | null
  evaluationAmount: Decimal | null
  unrealizedPnl: Decimal | null
  returnRate: Decimal | null
  priceStatus: PriceStatus
}

/**
 * GET /api/accounts/summary?market= (market 필수).
 * returnRate 는 퍼센트가 아니라 scale-4 비율이다 (0.0020 == 0.20%). 화면 표시 시 ×100 필수.
 */
export interface AccountSummary {
  cashBalance: Decimal
  holdingsValue: Decimal
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

/* ---------- 커뮤니티 ---------- */

/** 목록도 content 를 전부 포함한다. authorId 가 없어 소유 판정은 authorNickname 비교뿐이다. */
export interface Post {
  postId: number
  authorNickname: string
  title: string
  content: string
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

/** title 최대 100자, content 최대 5000자 */
export interface PostCreateRequest {
  title: string
  content: string
}
/** PATCH 는 부분 수정이 아니라 전체 교체 — 두 필드 모두 필수 */
export interface PostUpdateRequest {
  title: string
  content: string
}

/** GET /api/community/posts/{id}/comments — bare array, createdAt 오름차순, 페이지네이션·수정·대댓글·좋아요 없음 */
export interface Comment {
  commentId: number
  authorNickname: string
  content: string
  createdAt: LocalDateTimeString
}

/** content 최대 1000자 */
export interface CommentCreateRequest {
  content: string
}
