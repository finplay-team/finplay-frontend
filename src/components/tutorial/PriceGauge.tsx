// 손절가·현재가·익절가의 상대 위치를 가로 게이지로 보여주는 컴포넌트
import { formatKRW } from '../../lib/format'

export function PriceGauge({
  stopLoss,
  current,
  takeProfit,
}: {
  stopLoss: number
  current: number | null
  takeProfit: number
}) {
  if (current === null) {
    return <p className="text-sm text-muted">시세를 불러오는 중입니다.</p>
  }

  const range = takeProfit - stopLoss
  const toPercent = (value: number) =>
    range > 0 ? Math.min(100, Math.max(0, ((value - stopLoss) / range) * 100)) : 50

  const stopLossPos = toPercent(stopLoss)
  const takeProfitPos = toPercent(takeProfit)
  const currentPos = toPercent(current)

  return (
    <div className="pt-9 pb-10">
      <div className="relative h-2 rounded-full bg-elevated">
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-loss"
          style={{ left: `${stopLossPos}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gain"
          style={{ left: `${takeProfitPos}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-pulse-soft rounded-full bg-brand"
          style={{ left: `${currentPos}%` }}
        />

        <div
          className="absolute bottom-full mb-1.5 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${currentPos}%` }}
        >
          <p className="whitespace-nowrap text-[11px] text-brand">현재가</p>
          <p className="tabular whitespace-nowrap text-xs text-ink">{formatKRW(current)}</p>
        </div>

        <div
          className="absolute top-full mt-1.5 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${stopLossPos}%` }}
        >
          <p className="whitespace-nowrap text-[11px] text-loss">손절</p>
          <p className="tabular whitespace-nowrap text-xs text-muted">{formatKRW(stopLoss)}</p>
        </div>
        <div
          className="absolute top-full mt-1.5 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${takeProfitPos}%` }}
        >
          <p className="whitespace-nowrap text-[11px] text-gain">익절</p>
          <p className="tabular whitespace-nowrap text-xs text-muted">{formatKRW(takeProfit)}</p>
        </div>
      </div>
    </div>
  )
}
