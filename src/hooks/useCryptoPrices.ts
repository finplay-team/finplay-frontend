// 코인 현재가를 GET /api/instruments/{id}/price 폴링으로 유지하는 훅 (코인은 SSE 스트림이 없다)
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/apiClient'
import { getPrice } from '../services/instrumentService'
import type { PriceResponse } from '../services/types'

/** 409 PRICE_UNAVAILABLE 은 오류가 아니라 "지금 시세 없음"이라는 정상 상태다. */
const UNAVAILABLE: PriceResponse = {
  price: null,
  sourceTime: null,
  status: 'UNAVAILABLE',
  sourceTradingDate: null,
}

export interface UseCryptoPricesResult {
  /** instrumentId → 최신 시세. 아직 한 번도 못 받은 종목은 키가 없다. */
  prices: Record<number, PriceResponse>
  /** 마지막으로 폴링이 한 바퀴 끝난 시각(ms). 정체 판정에 쓴다. */
  lastUpdatedAt: number | null
  /** 네트워크·서버 오류. PRICE_UNAVAILABLE 은 여기 들어오지 않는다. */
  error: string | null
  refresh: () => void
}

export function useCryptoPrices(params: {
  instrumentIds: number[]
  enabled?: boolean
  /** 기본 5000ms — 캔들 폴링과 같은 주기 */
  pollMs?: number
}): UseCryptoPricesResult {
  const { instrumentIds, enabled = true, pollMs = 5000 } = params

  const [prices, setPrices] = useState<Record<number, PriceResponse>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // 배열 리터럴이 매 렌더 새로 생겨 effect 가 무한 재실행되는 것을 막는다.
  const idsKey = instrumentIds.join(',')
  const idsRef = useRef(instrumentIds)
  idsRef.current = instrumentIds

  useEffect(() => {
    if (!enabled || idsRef.current.length === 0) return

    let cancelled = false

    const load = async () => {
      const ids = idsRef.current
      const settled = await Promise.allSettled(ids.map((id) => getPrice(id)))
      if (cancelled) return

      let networkError: string | null = null
      const next: Record<number, PriceResponse> = {}
      settled.forEach((result, i) => {
        const id = ids[i]
        if (result.status === 'fulfilled') {
          next[id] = result.value
          return
        }
        const e = result.reason
        if (e instanceof ApiError && e.code === 'PRICE_UNAVAILABLE') {
          next[id] = UNAVAILABLE
          return
        }
        networkError = '시세를 불러오지 못했습니다. 다시 시도하고 있습니다.'
      })

      setPrices((prev) => ({ ...prev, ...next }))
      setLastUpdatedAt(Date.now())
      setError(networkError)
    }

    void load()
    const timer = setInterval(() => void load(), pollMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, idsKey, pollMs, nonce])

  return { prices, lastUpdatedAt, error, refresh }
}
