// 계좌 요약 조회 서비스
import { api } from '../lib/apiClient'
import type { AccountSummary, Market } from './types'

/** market 은 필수 파라미터다. */
export function getAccountSummary(market: Market): Promise<AccountSummary> {
  return api.get<AccountSummary>('/accounts/summary', { query: { market } })
}
