// 서버 없이 프론트를 실동작시키기 위한 인메모리 시드 데이터 저장소
import type {
  Account,
  DecisionLog,
  EconomicEvent,
  Holding,
  Instrument,
  Mission,
  PendingOrder,
  RankingRow,
  TradeRecord,
  TutorialStep,
  User,
} from './types'

/** 계좌별 지급 시드머니 (원) — 사용자 확정값 */
export const SEED_AMOUNT = 10_000_000

/** 데모 로그인용 비밀번호 (mock — 실제로는 해시 저장) */
export const mockPasswords: Record<string, string> = {
  'user@investory.app': 'demo1234',
  'admin@investory.app': 'admin1234',
}

export const users: User[] = [
  {
    id: 'u_demo',
    email: 'user@investory.app',
    nickname: '복리를믿는사람',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: '2026-05-02T09:00:00+09:00',
  },
  {
    id: 'u_admin',
    email: 'admin@investory.app',
    nickname: '운영자',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-01-10T09:00:00+09:00',
  },
  {
    id: 'u_02',
    email: 'jina@investory.app',
    nickname: '분산투자지나',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: '2026-05-11T09:00:00+09:00',
  },
  {
    id: 'u_03',
    email: 'hoon@investory.app',
    nickname: '존버훈',
    role: 'USER',
    status: 'SUSPENDED',
    createdAt: '2026-04-21T09:00:00+09:00',
  },
]

export const accounts: Account[] = [
  {
    id: 'a_demo_stock',
    userId: 'u_demo',
    market: 'STOCK',
    seedAmount: SEED_AMOUNT,
    bonusTotal: 0,
    cashBalance: 6_120_000,
    totalValue: 11_840_000,
    realizedPnl: 1_240_000,
    unrealizedPnl: 600_000,
  },
  {
    id: 'a_demo_crypto',
    userId: 'u_demo',
    market: 'CRYPTO',
    seedAmount: SEED_AMOUNT,
    bonusTotal: 0,
    cashBalance: 2_450_000,
    totalValue: 9_310_000,
    realizedPnl: -420_000,
    unrealizedPnl: -270_000,
  },
]

/** 랭킹 스냅샷 (일 단위 배치 결과를 mock으로 고정) */
export const stockRankings: RankingRow[] = [
  { rank: 1, accountId: 'a_r1', nickname: '눌림목장인', market: 'STOCK', realizedPnl: 4_820_000, returnRate: 48.2, avgHoldingDays: 12.4, tradeCount: 31, unrealizedPnl: -1_100_000 },
  { rank: 2, accountId: 'a_r2', nickname: '반도체올인', market: 'STOCK', realizedPnl: 3_640_000, returnRate: 36.4, avgHoldingDays: 3.1, tradeCount: 88, unrealizedPnl: -2_300_000 },
  { rank: 3, accountId: 'a_r3', nickname: '분산투자지나', market: 'STOCK', realizedPnl: 2_910_000, returnRate: 29.1, avgHoldingDays: 21.7, tradeCount: 18, unrealizedPnl: 340_000 },
  { rank: 4, accountId: 'a_r4', nickname: '배당모으기', market: 'STOCK', realizedPnl: 1_780_000, returnRate: 17.8, avgHoldingDays: 44.0, tradeCount: 9, unrealizedPnl: 210_000 },
  { rank: 5, accountId: 'a_demo_stock', nickname: '복리를믿는사람', market: 'STOCK', realizedPnl: 1_240_000, returnRate: 12.4, avgHoldingDays: 8.6, tradeCount: 24, unrealizedPnl: 600_000 },
  { rank: 6, accountId: 'a_r6', nickname: '차트보는밤', market: 'STOCK', realizedPnl: 940_000, returnRate: 9.4, avgHoldingDays: 1.8, tradeCount: 142, unrealizedPnl: -1_820_000 },
  { rank: 7, accountId: 'a_r7', nickname: '가치투자김씨', market: 'STOCK', realizedPnl: 610_000, returnRate: 6.1, avgHoldingDays: 33.2, tradeCount: 12, unrealizedPnl: 90_000 },
  { rank: 8, accountId: 'a_r8', nickname: '테마주헌터', market: 'STOCK', realizedPnl: 120_000, returnRate: 1.2, avgHoldingDays: 0.9, tradeCount: 210, unrealizedPnl: -3_400_000 },
]

export const cryptoRankings: RankingRow[] = [
  { rank: 1, accountId: 'a_c1', nickname: '온체인관찰자', market: 'CRYPTO', realizedPnl: 6_310_000, returnRate: 63.1, avgHoldingDays: 5.2, tradeCount: 64, unrealizedPnl: -900_000 },
  { rank: 2, accountId: 'a_c2', nickname: '비트만산다', market: 'CRYPTO', realizedPnl: 3_120_000, returnRate: 31.2, avgHoldingDays: 18.9, tradeCount: 22, unrealizedPnl: 1_240_000 },
  { rank: 3, accountId: 'a_c3', nickname: '김프헌터', market: 'CRYPTO', realizedPnl: 2_040_000, returnRate: 20.4, avgHoldingDays: 0.4, tradeCount: 388, unrealizedPnl: -2_600_000 },
  { rank: 4, accountId: 'a_c4', nickname: '알트존버', market: 'CRYPTO', realizedPnl: 880_000, returnRate: 8.8, avgHoldingDays: 41.0, tradeCount: 7, unrealizedPnl: -4_100_000 },
  { rank: 5, accountId: 'a_c5', nickname: '스테이킹러', market: 'CRYPTO', realizedPnl: 240_000, returnRate: 2.4, avgHoldingDays: 26.3, tradeCount: 15, unrealizedPnl: 130_000 },
  { rank: 6, accountId: 'a_demo_crypto', nickname: '복리를믿는사람', market: 'CRYPTO', realizedPnl: -420_000, returnRate: -4.2, avgHoldingDays: 1.1, tradeCount: 96, unrealizedPnl: -270_000 },
]

export const instruments: Instrument[] = [
  // 주식 (코스피 대표 16종목, LG화학은 거래정지 예시)
  { id: 'i_005930', market: 'STOCK', symbol: '005930', name: '삼성전자', tickSize: 100, minOrderAmount: 0, isTradable: true },
  { id: 'i_000660', market: 'STOCK', symbol: '000660', name: 'SK하이닉스', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_035420', market: 'STOCK', symbol: '035420', name: 'NAVER', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_051910', market: 'STOCK', symbol: '051910', name: 'LG화학', tickSize: 1000, minOrderAmount: 0, isTradable: false },
  { id: 'i_035720', market: 'STOCK', symbol: '035720', name: '카카오', tickSize: 100, minOrderAmount: 0, isTradable: true },
  { id: 'i_005380', market: 'STOCK', symbol: '005380', name: '현대차', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_000270', market: 'STOCK', symbol: '000270', name: '기아', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_207940', market: 'STOCK', symbol: '207940', name: '삼성바이오로직스', tickSize: 1000, minOrderAmount: 0, isTradable: true },
  { id: 'i_068270', market: 'STOCK', symbol: '068270', name: '셀트리온', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_005490', market: 'STOCK', symbol: '005490', name: 'POSCO홀딩스', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_373220', market: 'STOCK', symbol: '373220', name: 'LG에너지솔루션', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_006400', market: 'STOCK', symbol: '006400', name: '삼성SDI', tickSize: 500, minOrderAmount: 0, isTradable: true },
  { id: 'i_105560', market: 'STOCK', symbol: '105560', name: 'KB금융', tickSize: 100, minOrderAmount: 0, isTradable: true },
  { id: 'i_012450', market: 'STOCK', symbol: '012450', name: '한화에어로스페이스', tickSize: 1000, minOrderAmount: 0, isTradable: true },
  { id: 'i_034020', market: 'STOCK', symbol: '034020', name: '두산에너빌리티', tickSize: 50, minOrderAmount: 0, isTradable: true },
  { id: 'i_032830', market: 'STOCK', symbol: '032830', name: '삼성생명', tickSize: 500, minOrderAmount: 0, isTradable: true },
  // 코인 (원화마켓 대표 12종목)
  { id: 'i_btc', market: 'CRYPTO', symbol: 'KRW-BTC', name: '비트코인', tickSize: 1000, minOrderAmount: 5000, isTradable: true },
  { id: 'i_eth', market: 'CRYPTO', symbol: 'KRW-ETH', name: '이더리움', tickSize: 1000, minOrderAmount: 5000, isTradable: true },
  { id: 'i_sol', market: 'CRYPTO', symbol: 'KRW-SOL', name: '솔라나', tickSize: 100, minOrderAmount: 5000, isTradable: true },
  { id: 'i_xrp', market: 'CRYPTO', symbol: 'KRW-XRP', name: '리플', tickSize: 1, minOrderAmount: 5000, isTradable: true },
  { id: 'i_ada', market: 'CRYPTO', symbol: 'KRW-ADA', name: '에이다', tickSize: 1, minOrderAmount: 5000, isTradable: true },
  { id: 'i_doge', market: 'CRYPTO', symbol: 'KRW-DOGE', name: '도지코인', tickSize: 1, minOrderAmount: 5000, isTradable: true },
  { id: 'i_avax', market: 'CRYPTO', symbol: 'KRW-AVAX', name: '아발란체', tickSize: 10, minOrderAmount: 5000, isTradable: true },
  { id: 'i_link', market: 'CRYPTO', symbol: 'KRW-LINK', name: '체인링크', tickSize: 10, minOrderAmount: 5000, isTradable: true },
  { id: 'i_dot', market: 'CRYPTO', symbol: 'KRW-DOT', name: '폴카닷', tickSize: 5, minOrderAmount: 5000, isTradable: true },
  { id: 'i_trx', market: 'CRYPTO', symbol: 'KRW-TRX', name: '트론', tickSize: 1, minOrderAmount: 5000, isTradable: true },
  { id: 'i_etc', market: 'CRYPTO', symbol: 'KRW-ETC', name: '이더리움클래식', tickSize: 10, minOrderAmount: 5000, isTradable: true },
  { id: 'i_bch', market: 'CRYPTO', symbol: 'KRW-BCH', name: '비트코인캐시', tickSize: 100, minOrderAmount: 5000, isTradable: true },
]

export const missions: Mission[] = [
  { id: 'm_01', title: '첫 매수 체결', description: '아무 종목이나 한 번 매수해 계좌에 자산을 담아봅니다.', rewardType: 'BADGE', rewardLabel: '입문자 뱃지', order: 1, isActive: true },
  { id: 'm_02', title: '투자일기 작성', description: '매매 시 근거와 메모를 남겨 첫 의사결정 로그를 만듭니다.', rewardType: 'BADGE', rewardLabel: '기록자 뱃지', order: 2, isActive: true },
  { id: 'm_03', title: '분산투자 달성', description: '서로 다른 3개 종목에 나눠 담아 리스크를 분산합니다.', rewardType: 'BADGE', rewardLabel: '분산투자 뱃지', order: 3, isActive: true },
  { id: 'm_04', title: '첫 복기 확인', description: 'AI가 대조해 준 복기 피드백을 열람합니다.', rewardType: 'TITLE', rewardLabel: '복기하는 투자자', order: 4, isActive: true },
  { id: 'm_05', title: '주간 리포트 열람', description: '내 투자 습관 주간 리포트를 확인합니다.', rewardType: 'TITLE', rewardLabel: '성찰하는 투자자', order: 5, isActive: false },
]

export const economicEvents: EconomicEvent[] = [
  { id: 'e_01', title: '한국은행 기준금리 결정', type: 'RATE', eventAt: '2026-07-24T10:00:00+09:00', description: '금통위 기준금리 발표. 동결/인하 전망 혼재.', alertEnabled: true },
  { id: 'e_02', title: '미국 6월 CPI 발표', type: 'CPI', eventAt: '2026-07-15T21:30:00+09:00', description: '전월 대비 물가 상승률 발표.', alertEnabled: true },
  { id: 'e_03', title: '삼성전자 2분기 실적', type: 'EARNINGS', eventAt: '2026-07-31T08:00:00+09:00', description: '반도체 부문 영업이익 컨센서스 상회 전망.', alertEnabled: false },
]

/* ---------- 거래(모의투자) 상태 ---------- */

/** 종목별 당일 시가 (변동률 기준가) */
export const openPrices: Record<string, number> = {
  i_005930: 78_400,
  i_000660: 187_000,
  i_035420: 214_500,
  i_051910: 402_000,
  i_035720: 52_300,
  i_005380: 248_000,
  i_000270: 112_500,
  i_207940: 1_015_000,
  i_068270: 192_500,
  i_005490: 385_500,
  i_373220: 412_000,
  i_006400: 348_500,
  i_105560: 98_700,
  i_012450: 782_000,
  i_034020: 41_250,
  i_032830: 138_500,
  i_btc: 92_400_000,
  i_eth: 4_820_000,
  i_sol: 214_000,
  i_xrp: 3_180,
  i_ada: 1_050,
  i_doge: 310,
  i_avax: 48_200,
  i_link: 24_750,
  i_dot: 9_120,
  i_trx: 420,
  i_etc: 38_900,
  i_bch: 620_000,
}

/** 종목별 현재가 (시뮬레이션 틱으로 갱신). 초기값은 시가에서 살짝 이동 */
export const livePrices: Record<string, number> = {
  i_005930: 79_100,
  i_000660: 184_500,
  i_035420: 216_000,
  i_051910: 402_000,
  i_035720: 53_100,
  i_005380: 251_500,
  i_000270: 111_500,
  i_207940: 1_024_000,
  i_068270: 190_000,
  i_005490: 391_000,
  i_373220: 405_500,
  i_006400: 352_000,
  i_105560: 99_800,
  i_012450: 796_000,
  i_034020: 41_900,
  i_032830: 137_000,
  i_btc: 93_800_000,
  i_eth: 4_760_000,
  i_sol: 219_500,
  i_xrp: 3_240,
  i_ada: 1_038,
  i_doge: 318,
  i_avax: 47_650,
  i_link: 25_120,
  i_dot: 9_045,
  i_trx: 426,
  i_etc: 39_480,
  i_bch: 612_300,
}

/** 계좌별 보유 종목 (데모 계정에 초기 보유분 시드) */
export const holdings: Holding[] = [
  { accountId: 'a_demo_stock', instrumentId: 'i_005930', quantity: 40, avgPrice: 75_200 },
  { accountId: 'a_demo_stock', instrumentId: 'i_035420', quantity: 8, avgPrice: 208_000 },
  { accountId: 'a_demo_crypto', instrumentId: 'i_btc', quantity: 0.05, avgPrice: 95_100_000 },
  { accountId: 'a_demo_crypto', instrumentId: 'i_sol', quantity: 12, avgPrice: 205_000 },
]

export const tradeRecords: TradeRecord[] = [
  { id: 't_seed_1', accountId: 'a_demo_stock', instrumentId: 'i_005930', instrumentName: '삼성전자', side: 'BUY', price: 75_200, quantity: 40, amount: 3_008_000, fee: 451, executedAt: '2026-07-18T10:12:00+09:00' },
  { id: 't_seed_2', accountId: 'a_demo_stock', instrumentId: 'i_035420', instrumentName: 'NAVER', side: 'BUY', price: 208_000, quantity: 8, amount: 1_664_000, fee: 249, executedAt: '2026-07-19T13:40:00+09:00' },
  { id: 't_seed_3', accountId: 'a_demo_crypto', instrumentId: 'i_btc', instrumentName: '비트코인', side: 'BUY', price: 95_100_000, quantity: 0.05, amount: 4_755_000, fee: 2_377, executedAt: '2026-07-20T22:05:00+09:00' },
]

export const decisionLogs: DecisionLog[] = [
  {
    id: 'd_seed_1',
    tradeId: 't_seed_1',
    instrumentName: '삼성전자',
    side: 'BUY',
    basis: 'NEWS',
    memo: '반도체 업황 반등 기사. 실적 개선 기대로 분할 매수 시작.',
    createdAt: '2026-07-18T10:12:00+09:00',
    aiReview:
      '뉴스를 근거로 매수했습니다. 이후 주가는 실제로 반등했지만, 상승의 상당 부분은 업종 전반의 매크로 흐름에서 나왔습니다. 개별 실적보다 섹터 로테이션의 영향이 컸던 점을 함께 기억해 두면 좋겠습니다.',
  },
]

export const pendingOrders: PendingOrder[] = []

/* ---------- 튜토리얼 ---------- */

/** 입문자 튜토리얼 단계 (완료 시 시드 대비 %를 각 계좌에 지급) */
export const tutorialSteps: TutorialStep[] = [
  { id: 'tut_01', order: 1, title: '첫 매수 체결하기', description: '거래 화면에서 아무 종목이나 한 번 매수해 자산을 담아봅니다.', rewardRate: 0.02 },
  { id: 'tut_02', order: 2, title: '투자일기 남기기', description: '매매할 때 판단 근거와 메모를 남겨 첫 의사결정 로그를 만듭니다.', rewardRate: 0.03 },
  { id: 'tut_03', order: 3, title: '분산투자 해보기', description: '서로 다른 3개 종목에 나눠 담아 리스크를 분산해 봅니다.', rewardRate: 0.03 },
  { id: 'tut_04', order: 4, title: '첫 매도 경험하기', description: '보유 종목을 한 번 매도해 실현손익을 확정해 봅니다.', rewardRate: 0.05 },
  { id: 'tut_05', order: 5, title: '주식·코인 모두 거래', description: '주식 계좌와 코인 계좌 양쪽에서 각각 거래해 봅니다.', rewardRate: 0.05 },
]

/** 사용자별 보상 수령 완료 단계 id 집합 (userId → Set) */
export const claimedTutorial: Record<string, Set<string>> = {}
