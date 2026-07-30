// 체결 내역 커서 페이징 조회 서비스
import { api } from '../lib/apiClient'
import type { Market, TradePage } from './types'

/** limit 은 서버가 클램프하지 않고 400 을 내므로 클라이언트가 1..100 으로 강제한다. */
export function getTrades(p: {
  market: Market
  cursor?: string | null
  limit?: number
}): Promise<TradePage> {
  const limit = Math.min(100, Math.max(1, p.limit ?? 20))
  return api.get<TradePage>('/trades', {
    query: { market: p.market, cursor: p.cursor ?? undefined, limit },
  })
}
