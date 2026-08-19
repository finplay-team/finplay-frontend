// 분봉을 sourceTime 키로 upsert 병합해 유지하는 훅 (진행 중 봉이 제자리에서 갱신된다)
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/apiClient'
import { getCandles } from '../services/instrumentService'
import type { Candle, CandleInterval, Market } from '../services/types'

/**
 * 실시간 폴링으로 쌓이는 봉 + 과거 스크롤로 불러온 봉을 함께 담는 상한. 1분봉 기준 20,000개면
 * 약 14일치라 정상적인 세션에서는 사실상 안 걸린다 — 과거로 스크롤해서 불러온 봉이 다음 폴링에
 * 바로 잘려나가는 걸 막으려고(2026-08-19 피드백) 예전의 400보다 훨씬 크게 잡았다. 객체 20,000개는
 * 메모리상 가벼워 렌더 비용 문제는 없다(화면엔 CandleChart 가 그중 일부만 잘라 그린다).
 */
const MAX_BARS = 20000

export interface UseCandlesResult {
  /** sourceTime 오름차순 */
  candles: Candle[]
  /** 첫 로드에서만 true — 폴링 갱신은 화면을 깜빡이게 하지 않는다 */
  loading: boolean
  error: ApiError | null
  reload: () => void
  /** 지금 보유한 가장 이른 봉보다 더 과거를 불러온다(차트를 왼쪽 끝까지 팬했을 때 호출). */
  loadOlder: () => void
  /** loadOlder 요청이 진행 중인지 — 중복 호출을 막는 용도로도 쓴다. */
  loadingOlder: boolean
  /** false면 서버에 더 과거 봉이 없다는 뜻 — loadOlder 를 더 불러도 소용없다. */
  hasMoreHistory: boolean
}

export function useCandles(params: {
  instrumentId: number | null
  market: Market
  /** STOCK: 이 값이 바뀔 때 재조회한다. useStockStream 의 lastMessageAt 을 분 단위로 내린 값을 넘긴다. */
  minuteTick?: number
  /** CRYPTO 폴링 주기. 기본 5000ms */
  pollMs?: number
  /** 캔들 주기. 기본 '1m'. 대소문자 구분이라 '1M'(월)과 '1m'(분)이 다르다. */
  interval?: CandleInterval
}): UseCandlesResult {
  const { instrumentId, market, minuteTick, pollMs = 5000, interval = '1m' } = params

  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)

  const mapRef = useRef(new Map<string, Candle>())
  const loadingOlderRef = useRef(false)
  /** loadOlder 가 최신 candles 를 read-only 로 참조하기 위한 창구 — 매 폴링마다 콜백을 새로 만들지 않는다. */
  const candlesRef = useRef<Candle[]>([])
  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  // 종목·시장·주기가 바뀌면 누적 봉을 버린다.
  // interval 을 빼면 1m 과 1d 가 같은 sourceTime 키로 병합돼 차트가 조용히 섞인다.
  useEffect(() => {
    mapRef.current = new Map()
    setCandles([])
    setHasMoreHistory(true)
  }, [instrumentId, market, interval])

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
        const fetched = await getCandles(instrumentId, { interval, signal: controller.signal })
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
  }, [instrumentId, market, interval, minuteTick, pollMs, reloadNonce])

  const loadOlder = useCallback(() => {
    if (instrumentId === null || loadingOlderRef.current || !hasMoreHistory) return
    const oldest = candlesRef.current[0]
    if (!oldest) return

    loadingOlderRef.current = true
    setLoadingOlder(true)

    void (async () => {
      try {
        // to 는 "그 시각까지의 최신 200개"라 이미 갖고 있는 oldest 자신이 그대로 다시 올 수 있다 —
        // 엄격히 그보다 이른 것만 남긴다.
        const fetched = await getCandles(instrumentId, { interval, to: oldest.sourceTime })
        const older = fetched.filter((c) => c.sourceTime < oldest.sourceTime)
        if (older.length === 0) {
          setHasMoreHistory(false)
          return
        }
        const m = mapRef.current
        for (const c of older) m.set(c.sourceTime, c)
        const sorted = [...m.values()].sort((a, b) => (a.sourceTime < b.sourceTime ? -1 : 1))
        mapRef.current = new Map(sorted.map((c) => [c.sourceTime, c]))
        setCandles(sorted)
      } catch {
        // 실패해도 화면을 막지 않는다 — hasMoreHistory 는 그대로 두어 사용자가 다시 스크롤하면 재시도된다.
      } finally {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    })()
  }, [instrumentId, interval, hasMoreHistory])

  return { candles, loading, error, reload, loadOlder, loadingOlder, hasMoreHistory }
}
