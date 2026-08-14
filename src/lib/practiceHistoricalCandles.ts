// 튜토리얼 종목 선택 화면에서 "최근 한 달 추이"를 보여주기 위한 연습용 가상 일봉 생성기
import type { Candle } from '../services/types'
import { toLocalDateTimeString } from './datetime'

const DAYS = 30

/**
 * instrumentId를 시드로 쓰는 결정적 의사난수 — Math.random을 그대로 쓰면 새로고침마다 그래프
 * 모양이 바뀌어 "지난달에 봤던 그 모양"이라는 감이 사라진다. 같은 종목이면 항상 같은 추이를 본다.
 */
function seededRandom(seed: number): () => number {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 48271) % 2147483647
    return (state - 1) / 2147483646
  }
}

/**
 * 실제 시세 데이터가 아니라 오늘 가격(latestPrice)에서 거슬러 올라가는 가상의 하루 단위 랜덤워크다.
 * 튜토리얼 샘플 종목은 실제 시세 이력이 없어(순수 합성 틱만 있다) 이 함수로 "한 달 동안 이렇게
 * 움직였다고 가정하면" 수준의 연습용 배경을 만든다 — CandleChart는 실제 종목과 똑같이 그린다.
 */
export function generatePracticeMonthlyCandles(instrumentId: number, latestPrice: number): Candle[] {
  const rand = seededRandom(instrumentId * 7919 + Math.round(latestPrice))
  // 오늘 가격에서 거슬러 올라가며 만들고 마지막에 뒤집어 시간 순으로 맞춘다.
  const closes: number[] = [latestPrice]
  for (let i = 1; i < DAYS; i++) {
    const prev = closes[i - 1]
    const drift = (rand() - 0.5) * prev * 0.06
    closes.push(Math.max(prev * 0.4, prev + drift))
  }
  closes.reverse()

  const now = new Date()
  const candles: Candle[] = []
  for (let i = 0; i < DAYS; i++) {
    const open = i === 0 ? closes[0] : closes[i - 1]
    const close = closes[i]
    const wick = Math.abs(close - open) * 0.4 + Math.min(open, close) * 0.005
    const day = new Date(now)
    day.setDate(now.getDate() - (DAYS - 1 - i))
    candles.push({
      sourceTime: toLocalDateTimeString(day),
      open,
      close,
      high: Math.max(open, close) + wick * rand(),
      low: Math.max(0, Math.min(open, close) - wick * rand()),
      volume: 0,
    })
  }
  return candles
}
