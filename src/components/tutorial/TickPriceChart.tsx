// 자동으로 흐르는 샘플 시세를 선 그래프로 그리고, 손절·익절 참고선을 함께 표시하는 위젯
import { useMemo } from 'react'
import { formatKRW } from '../../lib/format'

export function TickPriceChart({
  prices,
  latest,
  referenceStopLoss,
  referenceTakeProfit,
  accent,
}: {
  prices: number[]
  latest: number | null
  referenceStopLoss?: number | null
  referenceTakeProfit?: number | null
  accent: 'brand' | 'coin'
}) {
  const { points, stopLossY, takeProfitY } = useMemo(() => {
    if (prices.length === 0) return { points: '', stopLossY: null, takeProfitY: null }
    const values = [...prices]
    if (referenceStopLoss != null) values.push(referenceStopLoss)
    if (referenceTakeProfit != null) values.push(referenceTakeProfit)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const toY = (v: number) => 100 - ((v - min) / span) * 100

    const pts = prices
      .map((p, i) => {
        const x = prices.length === 1 ? 100 : (i / (prices.length - 1)) * 100
        return `${x.toFixed(2)},${toY(p).toFixed(2)}`
      })
      .join(' ')

    return {
      points: pts,
      stopLossY: referenceStopLoss != null ? toY(referenceStopLoss) : null,
      takeProfitY: referenceTakeProfit != null ? toY(referenceTakeProfit) : null,
    }
  }, [prices, referenceStopLoss, referenceTakeProfit])

  const strokeClass = accent === 'coin' ? 'text-coin' : 'text-brand'

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">실시간 진행 중인 샘플 시세</span>
        <span className="tabular text-sm text-ink">{latest !== null ? formatKRW(latest) : '불러오는 중…'}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`mt-2 h-24 w-full ${strokeClass}`}>
        {stopLossY !== null && (
          <line x1="0" y1={stopLossY} x2="100" y2={stopLossY} stroke="currentColor" strokeWidth="0.5"
            className="text-loss" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
        )}
        {takeProfitY !== null && (
          <line x1="0" y1={takeProfitY} x2="100" y2={takeProfitY} stroke="currentColor" strokeWidth="0.5"
            className="text-gain" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
        )}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {(referenceStopLoss != null || referenceTakeProfit != null) && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span className="text-loss">손절 {referenceStopLoss != null ? formatKRW(referenceStopLoss) : '-'}</span>
          <span className="text-gain">익절 {referenceTakeProfit != null ? formatKRW(referenceTakeProfit) : '-'}</span>
        </div>
      )}
    </div>
  )
}
