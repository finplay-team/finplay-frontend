// 1일 가격 범위 바가 기존 캔들에서 하루 저가·고가를 뽑고 경계(데이터 없음·고가==저가)를 견디는지 검증한다
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Candle } from '../../services/types'
import { DayRangeBar, getDayRange } from './DayRangeBar'

function candle(sourceTime: string, low: number, high: number): Candle {
  return { sourceTime, open: low, high, low, close: high, volume: 0 }
}

describe('getDayRange', () => {
  it('캔들이 없으면 범위를 내지 않는다', () => {
    expect(getDayRange([], '1m')).toBeNull()
  })

  it('주·월봉은 봉 하나가 하루보다 길어 범위를 내지 않는다', () => {
    const candles = [candle('2026-08-10T00:00:00', 100, 200)]
    expect(getDayRange(candles, '1w')).toBeNull()
    expect(getDayRange(candles, '1M')).toBeNull()
  })

  it('일봉은 마지막 봉 하나가 그날 하루다', () => {
    const candles = [
      candle('2026-08-17T00:00:00', 50, 500),
      candle('2026-08-18T00:00:00', 100, 200),
    ]
    expect(getDayRange(candles, '1d')).toEqual({ low: 100, high: 200 })
  })

  it('분봉은 마지막 봉과 같은 날짜만 모아 계산한다 (앞 거래일이 섞이지 않는다)', () => {
    const candles = [
      candle('2026-08-17T15:29:00', 10, 9_000), // 앞 거래일 — 섞이면 안 된다
      candle('2026-08-18T09:00:00', 120, 180),
      candle('2026-08-18T09:01:00', 90, 210),
      candle('2026-08-18T09:02:00', 150, 160),
    ]
    expect(getDayRange(candles, '1m')).toEqual({ low: 90, high: 210 })
  })
})

describe('DayRangeBar', () => {
  const dayCandles = [candle('2026-08-18T09:00:00', 100, 200)]

  it('현재가가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <DayRangeBar candles={dayCandles} interval="1d" currentPrice={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('캔들이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<DayRangeBar candles={[]} interval="1m" currentPrice={150} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('저가·고가와 현재가 위치를 쉬운 말로 보여준다', () => {
    render(<DayRangeBar candles={dayCandles} interval="1d" currentPrice={150} />)

    expect(screen.getByText('오늘 가장 쌌을 때')).toBeInTheDocument()
    expect(screen.getByText('오늘 가장 비쌌을 때')).toBeInTheDocument()
    expect(screen.getByText('100원')).toBeInTheDocument()
    expect(screen.getByText('200원')).toBeInTheDocument()
    expect(
      screen.getByText(
        '지금은 150원이에요. 오늘 가장 쌌을 때와 가장 비쌌을 때 사이에서 50%쯤 되는 자리예요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('지금')).toHaveStyle({ left: '50%' })
  })

  it('고가와 저가가 같아도 0 으로 나누지 않고 안내 문구로 바꾼다', () => {
    render(
      <DayRangeBar
        candles={[candle('2026-08-18T09:00:00', 100, 100)]}
        interval="1d"
        currentPrice={100}
      />,
    )

    expect(
      screen.getByText('오늘은 가격이 아직 한 번도 바뀌지 않았어요. 계속 100원이에요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('지금')).toHaveStyle({ left: '50%' })
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('현재가가 오늘 범위를 벗어나도 막대 밖으로 나가지 않는다', () => {
    render(<DayRangeBar candles={dayCandles} interval="1d" currentPrice={500} />)

    expect(screen.getByText('지금')).toHaveStyle({ left: '100%' })
  })
})
