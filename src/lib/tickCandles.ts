// 틱 단위로 흐르는 단일 가격 배열을 CandleChart 가 그릴 수 있는 OHLC 봉으로 변환한다
import type { Candle } from '../services/types'
import { toLocalDateTimeString } from './datetime'

/**
 * 연속된 두 틱을 시가·종가로 묶어 봉 하나를 만든다 — 틱 사이 실제 고가·저가 변동은 알 수 없으므로
 * 시가·종가 중 큰 쪽/작은 쪽을 그대로 고가·저가로 쓴다. 거래량 데이터가 없어 항상 0이다.
 * 점이 1개 이하이면 봉을 만들 수 없어 빈 배열을 돌려준다(TickPriceChart의 기존 동작과 동일하게
 * CandleChart 쪽 "표시할 봉이 없습니다" 빈 상태로 처리된다).
 */
export function ticksToCandles(prices: number[], tickMs: number): Candle[] {
  if (prices.length < 2) return []
  const now = Date.now()
  const candles: Candle[] = []
  for (let i = 1; i < prices.length; i++) {
    const open = prices[i - 1]
    const close = prices[i]
    candles.push({
      sourceTime: toLocalDateTimeString(new Date(now - (prices.length - 1 - i) * tickMs)),
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      volume: 0,
    })
  }
  return candles
}
