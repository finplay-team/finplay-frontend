// 주식 SSE(/api/stocks/stream)를 fetch + ReadableStream 으로 직접 파싱하는 훅
// EventSource 는 Authorization 헤더를 실을 수 없어서 쓸 수 없다(D2).
import { useEffect, useRef, useState } from 'react'
import { refreshAccessToken } from '../lib/apiClient'
import * as tokenStore from '../lib/tokenStore'
import type {
  LocalDateString,
  MarketStatus,
  StockPriceEvent,
  StockSnapshotEvent,
  StockStatusEvent,
  StreamPriceSnapshot,
} from '../services/types'

export type StreamConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface StockStream {
  /** symbol → 최신 시세. snapshot 으로 16종 전부 채워지고 price 이벤트로 부분 갱신된다. */
  prices: Record<string, StreamPriceSnapshot>
  marketStatus: MarketStatus | null
  sourceTradingDate: LocalDateString | null
  state: StreamConnectionState
  /** 마지막으로 서버 바이트(:heartbeat 포함)를 받은 시각. 20초 heartbeat 이므로 40초 넘으면 정체다. */
  lastMessageAt: number | null
  error: string | null
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export function useStockStream(options?: { enabled?: boolean }): StockStream {
  const enabled = options?.enabled ?? true

  const [prices, setPrices] = useState<Record<string, StreamPriceSnapshot>>({})
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
  const [sourceTradingDate, setSourceTradingDate] = useState<LocalDateString | null>(null)
  const [state, setState] = useState<StreamConnectionState>('idle')
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 재연결 백오프 상태는 렌더와 무관하므로 ref 에 둔다.
  const retryMsRef = useRef(3000)
  const attemptRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setState('idle')
      return
    }

    const controller = new AbortController()
    let cancelled = false
    let refreshedThisAttempt = false
    retryMsRef.current = 3000
    attemptRef.current = 0

    const handleFrame = (frame: string) => {
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue // :heartbeat — 코멘트이지 이벤트가 아니다
        if (line.startsWith('retry:')) {
          const n = Number(line.slice(6).trim())
          if (n > 0) retryMsRef.current = n
          continue
        }
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
          continue
        }
        // id: 는 파싱하지 않는다 — 서버에 리플레이 버퍼가 없어 Last-Event-ID 를 보내면 오해만 낳는다.
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length === 0) return // heartbeat·retry 전용 프레임

      const payload = JSON.parse(data.join('\n'))
      if (event === 'snapshot') {
        const snapshot = payload as StockSnapshotEvent
        setPrices(Object.fromEntries(snapshot.prices.map((p) => [p.symbol, p])))
        setMarketStatus(snapshot.marketStatus)
        setSourceTradingDate(snapshot.sourceTradingDate)
        attemptRef.current = 0 // 첫 snapshot 수신을 연결 성공으로 보고 백오프를 리셋한다
        setState('open')
        setError(null)
      } else if (event === 'price') {
        const priceEvent = payload as StockPriceEvent
        setPrices((prev) => ({
          ...prev,
          [priceEvent.symbol]: {
            symbol: priceEvent.symbol,
            price: priceEvent.price,
            sourceTime: priceEvent.sourceTime,
            status: 'AVAILABLE',
          },
        }))
        setMarketStatus(priceEvent.marketStatus)
        if (priceEvent.sourceTradingDate) setSourceTradingDate(priceEvent.sourceTradingDate)
      } else if (event === 'status') {
        setMarketStatus((payload as StockStatusEvent).marketStatus)
      }
    }

    const connect = async () => {
      while (!cancelled) {
        const token = tokenStore.getAccessToken()
        if (!token) {
          setState('closed')
          return
        }
        setState(attemptRef.current === 0 ? 'connecting' : 'reconnecting')

        try {
          const res = await fetch('/api/stocks/stream', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: controller.signal,
            cache: 'no-store',
          })

          if (res.status === 401) {
            if (refreshedThisAttempt) throw new Error('unauthorized')
            refreshedThisAttempt = true
            await refreshAccessToken() // apiClient 의 동일한 단일 비행 함수를 재사용한다
            continue // 인증 실패였으므로 백오프 없이 즉시 1회 재연결
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)

          refreshedThisAttempt = false
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break // 서버가 끊음 → 아래 백오프로 재연결
            buffer += decoder.decode(value, { stream: true })
            setLastMessageAt(Date.now())
            buffer = buffer.replace(/\r\n/g, '\n')
            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? '' // 마지막 조각은 미완성 프레임
            for (const frame of frames) handleFrame(frame)
          }
        } catch {
          if (controller.signal.aborted) return
          // 갱신까지 실패하면 tokenStore 가 비워져 있다 → ProtectedRoute 가 /login 으로 보낸다.
          if (!tokenStore.getAccessToken()) {
            setState('closed')
            return
          }
          setError('시세 연결이 끊겼습니다. 재연결하고 있습니다.')
        }

        if (cancelled) return
        const delay = Math.min(retryMsRef.current * 2 ** attemptRef.current, 30_000) + Math.random() * 500
        attemptRef.current += 1
        await sleep(delay, controller.signal)
      }
    }

    void connect()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled])

  return { prices, marketStatus, sourceTradingDate, state, lastMessageAt, error }
}
