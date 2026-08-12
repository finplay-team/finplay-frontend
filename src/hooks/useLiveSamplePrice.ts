// 튜토리얼 샘플 종목의 현재가를 일정 간격으로 자동 재조회해 누적하는 훅 — 클릭 없이 시간이 흐르며 진행된다
import { useEffect, useRef, useState } from 'react'
import { getPrice } from '../services/instrumentService'

const TICK_MS = 2000
const MAX_POINTS = 30

export interface LiveSamplePriceState {
  /** 오래된 값이 앞, 최신 값이 뒤. 화면에 보일 최대 30개까지만 유지한다. */
  prices: number[]
  latest: number | null
  tickCount: number
  error: string | null
}

/**
 * 샘플 종목은 항시 유효 가격을 반환하므로(031) 폴링 실패를 사용자에게 반복 노출하지 않고 조용히
 * 건너뛴다 — 다음 tick에서 다시 시도한다.
 */
export function useLiveSamplePrice(instrumentId: number, running: boolean): LiveSamplePriceState {
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
            const nextPrices = [...prev.prices, res.price!].slice(-MAX_POINTS)
            return { prices: nextPrices, latest: res.price, tickCount: prev.tickCount + 1, error: null }
          })
        })
        .catch(() => {
          // 조용히 건너뛴다 — 다음 tick에서 재시도.
        })
    }

    poll()
    const id = setInterval(poll, TICK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [instrumentId, running])

  return state
}
