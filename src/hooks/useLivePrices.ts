// 일정 주기로 시세를 틱시켜 실시간처럼 갱신하고, 최신 시세·버전을 반환하는 훅
import { useCallback, useEffect, useState } from 'react'
import { tradeService } from '../services/tradeService'
import type { Market, Quote } from '../services/types'

export function useLivePrices(market: Market, intervalMs = 2200) {
  const [quotes, setQuotes] = useState<Quote[]>(() => tradeService.getQuotesSync(market))
  // 시세가 바뀔 때마다 증가시켜, 보유·요약 등 파생 데이터의 재계산 트리거로 사용
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setQuotes(tradeService.getQuotesSync(market))
    setVersion((v) => v + 1)

    const id = setInterval(() => {
      tradeService.tick(market)
      setQuotes(tradeService.getQuotesSync(market))
      setVersion((v) => v + 1)
    }, intervalMs)

    return () => clearInterval(id)
  }, [market, intervalMs])

  /** 주문 체결 직후 등 즉시 갱신이 필요할 때 호출 */
  const refresh = useCallback(() => {
    setQuotes(tradeService.getQuotesSync(market))
    setVersion((v) => v + 1)
  }, [market])

  return { quotes, version, refresh }
}
