// 실현손익 랭킹 조회 서비스 (RANK-001·002 — 두 엔드포인트의 응답 구조가 서로 다르다)
import { api } from '../lib/apiClient'
import type { Market, MyRanking, RankingList } from './types'

/**
 * GET /api/rankings — market 필수, 커서·페이지 필드 없는 top-N 목록이다.
 *
 * **limit 을 클라이언트에서 클램프하지 않는다.** 이 API 만 서버가 조용히 클램핑하기 때문이다
 * (생략·0 이하 → 10, 51 이상 → 50). tradeService·orderService 의 `Math.min(100, Math.max(1, ...))`
 * 패턴을 여기에 복사하면 서버 기본값 10 이 가려지고, 특히 Math.max(1,...) 는 1건만 받아오게 만든다.
 * 그래서 limit 은 받은 값을 그대로 넘기고, 생략이면 쿼리에서 빠져 서버 기본값 10 이 적용된다.
 *
 * 대신 정수만 보낸다 — 클램핑은 파싱된 정수에만 적용되고 `abc` 같은 비정수는 400 이다.
 *
 * 호출부는 요청 limit 이 아니라 **응답 content.length** 를 화면 계산에 써야 한다.
 * 요청값과 실제 항목 수가 다를 수 있다.
 */
export function getRankings(p: { market: Market; limit?: number }): Promise<RankingList> {
  const limit = p.limit !== undefined && Number.isInteger(p.limit) ? p.limit : undefined
  return api.get<RankingList>('/rankings', { query: { market: p.market, limit } })
}

/**
 * GET /api/rankings/me — market 필수, limit 파라미터가 없다. 대상은 항상 토큰의 본인이다.
 *
 * 응답이 목록과 **다른 모양**이다. 목록은 `{market, content:[...]}` 2단이고 여기는 flat 이라
 * `content` 로 접근하면 undefined 다.
 *
 * 매도 이력이 없어도 오류가 아니라 200 이고 `rank` 만 null 이다(`nickname`·`realizedPnl`=0 은 항상 값이 있다).
 * 403·404 는 이 엔드포인트에 없다.
 *
 * realizedPnl 은 Redis ZSET score 라 GET /api/accounts/summary 의 DB 값과 순간적으로 어긋날 수 있다 —
 * 계좌 숫자와 나란히 놓지 말고 랭킹 위젯 안에서만 쓴다.
 */
export function getMyRanking(market: Market): Promise<MyRanking> {
  return api.get<MyRanking>('/rankings/me', { query: { market } })
}
