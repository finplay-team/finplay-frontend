// 자동으로 흐르는 샘플 시세를 실제 코인·주식 화면과 같은 CandleChart 형식으로 그리고, 손절·익절 참고선을 함께 표시하는 위젯
import { useMemo } from 'react'
import { CandleChart } from '../CandleChart'
import { formatKRW } from '../../lib/format'
import { ticksToCandles } from '../../lib/tickCandles'

/**
 * 참고 시세 꼬리(3초 간격)와 실시간 틱(2초 간격)이 하나의 배열로 섞여 들어온다 — 실제 간격은
 * evidence 판정과 무관하므로 시간축 표기가 자연스럽게 흐르도록 근사값 하나로 고정한다.
 */
const APPROX_TICK_MS = 2000

export function TickPriceChart({
  prices,
  latest,
  referenceStopLoss,
  referenceTakeProfit,
}: {
  prices: number[]
  latest: number | null
  referenceStopLoss?: number | null
  referenceTakeProfit?: number | null
}) {
  const candles = useMemo(() => ticksToCandles(prices, APPROX_TICK_MS), [prices])

  const referenceLines = useMemo(() => {
    const lines: { value: number; tone: 'gain' | 'loss'; label: string }[] = []
    if (referenceStopLoss != null) lines.push({ value: referenceStopLoss, tone: 'loss' as const, label: '손절' })
    if (referenceTakeProfit != null) lines.push({ value: referenceTakeProfit, tone: 'gain' as const, label: '익절' })
    return lines
  }, [referenceStopLoss, referenceTakeProfit])

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">실시간 진행 중인 샘플 시세</span>
        <span className="tabular text-sm text-ink">{latest !== null ? formatKRW(latest) : '불러오는 중…'}</span>
      </div>
      <div className="mt-2">
        <CandleChart
          candles={candles}
          height={160}
          maxBars={Math.max(prices.length, 1)}
          interval="1m"
          emptyMessage="아직 표시할 시세가 없습니다."
          referenceLines={referenceLines}
        />
      </div>
      {(referenceStopLoss != null || referenceTakeProfit != null) && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span className="text-loss">손절 {referenceStopLoss != null ? formatKRW(referenceStopLoss) : '-'}</span>
          <span className="text-gain">익절 {referenceTakeProfit != null ? formatKRW(referenceTakeProfit) : '-'}</span>
        </div>
      )}
    </div>
  )
}
