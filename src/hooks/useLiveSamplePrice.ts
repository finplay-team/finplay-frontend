// 튜토리얼 샘플 종목의 현재가를 일정 간격으로 자동 재조회해 누적하는 훅 — 클릭 없이 시간이 흐르며 진행된다
import { useEffect, useRef, useState } from 'react'
import { getPrice } from '../services/instrumentService'

const DEFAULT_TICK_MS = 2000
const DEFAULT_MAX_POINTS = 30

export interface LiveSamplePriceState {
  /** 오래된 값이 앞, 최신 값이 뒤. maxPoints 개수까지만 유지한다. */
  prices: number[]
  latest: number | null
  tickCount: number
  error: string | null
}

export interface UseLiveSamplePriceOptions {
  /** 몇 ms마다 다시 조회할지. 기본 2000ms. */
  tickMs?: number
  /** 그래프에 남길 최대 점 개수. 기본 30개. 5분 매도 시한처럼 전체 구간을 다 보여줘야 하면
   * tickMs·maxPoints를 함께 조정해 구간 전체(예: 5분 × 60틱 = 5초 간격)가 잘리지 않게 한다. */
  maxPoints?: number
}

/**
 * 샘플 종목은 항시 유효 가격을 반환하므로(031) 폴링 실패를 사용자에게 반복 노출하지 않고 조용히
 * 건너뛴다 — 다음 tick에서 다시 시도한다.
 */
export function useLiveSamplePrice(
  instrumentId: number,
  running: boolean,
  options: UseLiveSamplePriceOptions = {},
): LiveSamplePriceState {
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS
  const [state, setState] = useState<LiveSamplePriceState>({
    prices: [],
    latest: null,
    tickCount: 0,
    error: null,
  })
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!running) return

    let cancelled = false
    const poll = () => {
      getPrice(instrumentId)
        .then((res) => {
          if (cancelled || !aliveRef.current || res.price === null) return
          setState((prev) => {
            const nextPrices = [...prev.prices, res.price!].slice(-maxPoints)
            return { prices: nextPrices, latest: res.price, tickCount: prev.tickCount + 1, error: null }
          })
        })
        .catch(() => {
          // 조용히 건너뛴다 — 다음 tick에서 재시도.
        })
    }

    poll()
    const id = setInterval(poll, tickMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [instrumentId, running, tickMs, maxPoints])

  return state
}
