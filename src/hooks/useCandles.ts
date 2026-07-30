// 분봉을 sourceTime 키로 upsert 병합해 유지하는 훅 (진행 중 봉이 제자리에서 갱신된다)
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/apiClient'
import { getCandles } from '../services/instrumentService'
import type { Candle, Market } from '../services/types'

const MAX_BARS = 400

export interface UseCandlesResult {
  /** sourceTime 오름차순 */
  candles: Candle[]
  /** 첫 로드에서만 true — 폴링 갱신은 화면을 깜빡이게 하지 않는다 */
  loading: boolean
  error: ApiError | null
  reload: () => void
}

export function useCandles(params: {
  instrumentId: number | null
  market: Market
  /** STOCK: 이 값이 바뀔 때 재조회한다. useStockStream 의 lastMessageAt 을 분 단위로 내린 값을 넘긴다. */
  minuteTick?: number
  /** CRYPTO 폴링 주기. 기본 5000ms */
  pollMs?: number
}): UseCandlesResult {
  const { instrumentId, market, minuteTick, pollMs = 5000 } = params

  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const mapRef = useRef(new Map<string, Candle>())

  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  // 종목·시장이 바뀌면 누적 봉을 버린다. 다른 종목 봉이 섞이면 차트가 깨진다.
  useEffect(() => {
    mapRef.current = new Map()
    setCandles([])
  }, [instrumentId, market])

  useEffect(() => {
    if (instrumentId === null) return

    const controller = new AbortController()
    let firstLoad = mapRef.current.size === 0

    const merge = (fetched: Candle[]) => {
      const m = mapRef.current
      for (const c of fetched) m.set(c.sourceTime, c) // 같은 key → 진행 중 봉이 제자리에서 갱신된다
      // ISO 문자열은 사전순 == 시간순이다.
      const sorted = [...m.values()].sort((a, b) => (a.sourceTime < b.sourceTime ? -1 : 1))
      if (sorted.length > MAX_BARS) sorted.splice(0, sorted.length - MAX_BARS)
      mapRef.current = new Map(sorted.map((c) => [c.sourceTime, c]))
      setCandles(sorted)
    }

    const load = async () => {
      if (firstLoad) setLoading(true)
      try {
        const fetched = await getCandles(instrumentId, { signal: controller.signal })
        if (controller.signal.aborted) return // 낡은 응답이 병합되면 안 된다
        merge(fetched)
        setError(null)
      } catch (e) {
        if (controller.signal.aborted) return
        if (e instanceof ApiError) setError(e)
      } finally {
        if (!controller.signal.aborted && firstLoad) {
          setLoading(false)
          firstLoad = false
        }
      }
    }

    void load()

    // 주식은 서버 분 크론에만 새 봉이 생기므로 minuteTick 변화로만 재조회한다.
    if (market === 'CRYPTO') {
      const timer = setInterval(load, pollMs)
      return () => {
        controller.abort()
        clearInterval(timer)
      }
    }
    return () => controller.abort()
  }, [instrumentId, market, minuteTick, pollMs, reloadNonce])

  return { candles, loading, error, reload }
}
