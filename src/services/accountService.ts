// 계좌 요약·전체 포트폴리오 조회 서비스
import { api } from '../lib/apiClient'
import type { AccountSummary, Market, PortfolioTotal } from './types'

/** market 은 필수 파라미터다. returnRate 는 퍼센트가 아니라 scale-4 비율이므로 표시 시 ratioToPercent 를 쓴다. */
export function getAccountSummary(market: Market): Promise<AccountSummary> {
  return api.get<AccountSummary>('/accounts/summary', { query: { market } })
}

/** 두 시장 합산이라 분모가 20,000,000 이다. 주식 단일 시장 화면에서는 쓰지 않는다(D3). */
export function getPortfolio(): Promise<PortfolioTotal> {
  return api.get<PortfolioTotal>('/portfolio')
}
