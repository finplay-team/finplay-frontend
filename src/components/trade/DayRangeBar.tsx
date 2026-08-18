// 오늘 가장 쌌을 때~비쌌을 때 구간에서 현재가가 어디쯤인지 가로 막대로 보여주는 1일 가격 범위 바
import { formatPrice } from '../../lib/format'
import type { Candle, CandleInterval } from '../../services/types'

export interface DayRange {
  low: number
  high: number
}

/**
 * 화면이 이미 받아 둔 캔들에서 하루치 저가·고가를 뽑는다 — 이걸 위한 API 호출은 따로 하지 않는다.
 * - `1m`: 마지막 봉과 같은 날짜의 분봉만 모아 최저·최고를 계산한다. 주식 분봉의 sourceTime 날짜는
 *   오늘이 아니라 재생 중인 거래일이라, "마지막 봉의 날짜"가 곧 이 화면의 오늘이다.
 * - `1d`: 마지막 봉 하나가 그날 하루다(진행 중 버킷도 응답에 포함된다).
 * - `1w`·`1M`: 봉 하나가 하루보다 길어 하루 범위를 낼 수 없다 → null.
 */
export function getDayRange(candles: Candle[], interval: CandleInterval): DayRange | null {
  if (candles.length === 0) return null
  if (interval === '1w' || interval === '1M') return null

  const last = candles[candles.length - 1]
  const sameDay =
    interval === '1d'
      ? [last]
      : candles.filter((c) => c.sourceTime.slice(0, 10) === last.sourceTime.slice(0, 10))

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const c of sameDay) {
    if (c.low < low) low = c.low
    if (c.high > high) high = c.high
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return null
  return { low, high }
}

interface Props {
  candles: Candle[]
  interval: CandleInterval
  currentPrice: number | null
}

export function DayRangeBar({ candles, interval, currentPrice }: Props) {
  const range = getDayRange(candles, interval)
  // 범위를 못 구하는 상황은 차트가 이미 자기 자리에서 설명한다 — 여기서 또 알리지 않는다.
  if (range === null || currentPrice === null) return null

  const { low, high } = range
  // 고가와 저가가 같으면 (high - low) 가 0 이라 나눌 수 없다. 아직 한 번도 안 움직인 경우다.
  const flat = high === low
  const percent = flat
    ? 50
    : Math.min(100, Math.max(0, ((currentPrice - low) / (high - low)) * 100))

  return (
    <div className="mt-5">
      <p className="text-xs font-medium text-ink">오늘 가격이 오르내린 폭</p>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] text-muted">
        <span>오늘 가장 쌌을 때</span>
        <span>오늘 가장 비쌌을 때</span>
      </div>
      <div className="relative mt-6 h-2 rounded-full bg-white/[0.06]">
        <span
          className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-ink"
          style={{ left: `${percent}%` }}
        >
          지금
        </span>
        <span
          aria-hidden
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-canvas"
          style={{ left: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-ink tabular">
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {flat
          ? `오늘은 가격이 아직 한 번도 바뀌지 않았어요. 계속 ${formatPrice(currentPrice)}이에요.`
          : `지금은 ${formatPrice(currentPrice)}이에요. 오늘 가장 쌌을 때와 가장 비쌌을 때 사이에서 ${Math.round(percent)}%쯤 되는 자리예요.`}
      </p>
    </div>
  )
}
