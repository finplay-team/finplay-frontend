// 서비스 전역에서 공유하는 도메인 타입 정의 (백엔드 엔티티와 1:1 대응)

export type Market = 'STOCK' | 'CRYPTO'
export type Role = 'USER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'SUSPENDED'

export interface User {
  id: string
  email: string
  nickname: string
  role: Role
  status: UserStatus
  createdAt: string
}

/** 로그인 세션에 노출되는 공개 사용자 정보 (비밀번호 제외) */
export type SessionUser = Omit<User, never>

export interface Account {
  id: string
  userId: string
  market: Market
  /** 지급 시드머니 (원). 확정값 10,000,000 */
  seedAmount: number
  /** 튜토리얼 보상으로 추가 지급된 누적 보너스 (원) */
  bonusTotal: number
  cashBalance: number
  /** 보유자산 평가액 + 현금 */
  totalValue: number
  /** 실현손익 누적 (랭킹 산정 기준) */
  realizedPnl: number
  /** 미실현 평가손익 (AI 리포트 기준) */
  unrealizedPnl: number
}

export interface Instrument {
  id: string
  market: Market
  symbol: string
  name: string
  /** 호가 단위 (원). 코인은 소수 가능 */
  tickSize: number
  /** 최소 주문 금액 (원) */
  minOrderAmount: number
  isTradable: boolean
}

export interface RankingRow {
  rank: number
  accountId: string
  nickname: string
  market: Market
  realizedPnl: number
  /** 수익률 % (참고 지표) */
  returnRate: number
  avgHoldingDays: number
  tradeCount: number
  /** 미실현 손익 — AI 관점 대비용 */
  unrealizedPnl: number
}

export interface HabitMetrics {
  tradeCount: number
  avgHoldingDays: number
  stopLossRatio: number
  concentrationCount: number
}

export interface Mission {
  id: string
  title: string
  description: string
  rewardType: 'BADGE' | 'TITLE' | 'NONE'
  rewardLabel: string
  order: number
  isActive: boolean
}

export type EconomicEventType = 'RATE' | 'CPI' | 'EARNINGS' | 'ETC'

export interface EconomicEvent {
  id: string
  title: string
  type: EconomicEventType
  eventAt: string
  description: string
  alertEnabled: boolean
}

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalAccounts: number
  todayTradeVolume: number
  activeEvents: number
}

/** 회원가입 요청 페이로드 */
export interface SignupPayload {
  email: string
  nickname: string
  password: string
}

/* ---------- 거래(모의투자) 도메인 ---------- */

export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'MARKET' | 'LIMIT'
export type OrderStatus = 'FILLED' | 'PENDING' | 'CANCELLED'
export type DecisionBasis = 'NEWS' | 'TECHNICAL' | 'LONGTERM' | 'GUT' | 'ETC'

/** 실시간(시뮬레이션) 시세 스냅샷 */
export interface Quote {
  instrumentId: string
  price: number
  /** 당일 시가 대비 변동액 */
  changeAmount: number
  /** 당일 시가 대비 변동률 (%) */
  changeRate: number
}

/** 계좌별 종목 보유 현황 */
export interface Holding {
  accountId: string
  instrumentId: string
  quantity: number
  avgPrice: number
}

/** 보유 종목의 현재가 평가 결과 */
export interface Position {
  instrument: Instrument
  quantity: number
  avgPrice: number
  currentPrice: number
  marketValue: number
  costBasis: number
  unrealizedPnl: number
  unrealizedRate: number
}

/** 계좌 요약 (현금 + 평가액 + 손익) */
export interface PortfolioSummary {
  accountId: string
  market: Market
  seedAmount: number
  /** 시드 + 튜토리얼 보너스 = 투자원금 */
  investedCapital: number
  cashBalance: number
  holdingsValue: number
  totalValue: number
  realizedPnl: number
  unrealizedPnl: number
  returnRate: number
}

/** 체결된 거래 내역 */
export interface TradeRecord {
  id: string
  accountId: string
  instrumentId: string
  instrumentName: string
  side: OrderSide
  price: number
  quantity: number
  amount: number
  fee: number
  executedAt: string
  decisionLogId?: string
}

/** 미체결 지정가 주문 */
export interface PendingOrder {
  id: string
  accountId: string
  instrumentId: string
  instrumentName: string
  side: OrderSide
  limitPrice: number
  quantity: number
  status: OrderStatus
  createdAt: string
}

/** 투자일기 (매매 근거 + 메모 + AI 복기) */
export interface DecisionLog {
  id: string
  tradeId: string
  instrumentName: string
  side: OrderSide
  basis: DecisionBasis
  memo: string
  createdAt: string
  aiReview?: string
}

/** 주문 요청 페이로드 */
export interface PlaceOrderInput {
  accountId: string
  instrumentId: string
  side: OrderSide
  orderType: OrderType
  quantity: number
  /** 지정가일 때 필수 */
  limitPrice?: number
  decision?: {
    basis: DecisionBasis
    memo: string
  }
}

/** 주문 결과 */
export interface PlaceOrderResult {
  status: 'FILLED' | 'PENDING'
  trade?: TradeRecord
  pending?: PendingOrder
}

/* ---------- 튜토리얼(입문자 온보딩) ---------- */

/** 입문자 튜토리얼 단계. 완료 시 초기지급액의 rewardRate 만큼 보너스 지급 */
export interface TutorialStep {
  id: string
  order: number
  title: string
  description: string
  /** 시드머니 대비 지급 비율 (예: 0.02 = 2%) */
  rewardRate: number
}

/** 사용자별 단계 진행 상태 */
export interface TutorialProgress {
  step: TutorialStep
  /** 실제 거래 활동으로 자동 판정한 완료 여부 */
  completed: boolean
  /** 보상 수령 여부 */
  claimed: boolean
}

/** 보상 수령 결과 */
export interface ClaimResult {
  rewardRate: number
  /** 계좌별로 지급된 금액 (원) */
  bonusPerAccount: number
  progress: TutorialProgress[]
}
