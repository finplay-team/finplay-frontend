// 시장별 보유 종목 조회 서비스
import { api } from '../lib/apiClient'
import type { Holding, Market } from './types'

/** market 은 필수 파라미터다. 시세가 없으면 평가 관련 4개 필드가 null 로 온다. */
export function getHoldings(market: Market): Promise<Holding[]> {
  return api.get<Holding[]>('/holdings', { query: { market } })
}
