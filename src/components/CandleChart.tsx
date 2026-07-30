// 라이브러리 없이 인라인 SVG 로 1분봉을 그리는 캔들 차트 (빈 배열은 오류가 아니라 정상 상태다)
import { formatHhMm } from '../lib/datetime'
import type { Candle } from '../services/types'

interface CandleChartProps {
  candles: Candle[]
  /** viewBox 단위. 실제 폭은 CSS(width:100%)가 결정한다. */
  width?: number
  height?: number
  /** 꼬리에서 잘라 그릴 최대 봉 수 */
  maxBars?: number
  emptyMessage?: string
  className?: string
}

const PAD = { top: 8, right: 44, bottom: 20, left: 8 }

export function CandleChart({
  candles,
  width = 640,
  height = 260,
  maxBars = 120,
  emptyMessage = '표시할 분봉이 없습니다.',
  className = '',
}: CandleChartProps) {
  const bars = candles.slice(-maxBars)
  const n = bars.length
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  if (n === 0) {
    return (
      <div className={`w-full ${className}`}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-auto w-full"
          role="img"
          aria-label="1분봉 차트 (데이터 없음)"
        >
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fontSize={13}
            fill="currentColor"
            className="text-muted"
          >
            {emptyMessage}
          </text>
        </svg>
      </div>
    )
  }

  let lo = Math.min(...bars.map((b) => b.low))
  let hi = Math.max(...bars.map((b) => b.high))
  // 시드 데이터나 봉 1개면 hi === lo 가 될 수 있어 0 나눗셈을 막는다.
  const span = hi - lo || Math.max(Math.abs(hi) * 0.001, 1)
  const pad = span * 0.06
  lo -= pad
  hi += pad

  const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH
  const barW = plotW / n
  const x = (i: number) => PAD.left + (i + 0.5) * barW
  const bodyW = Math.max(1, barW * 0.6)

  const gridValues = [hi, (lo + hi) / 2, lo]

  return (
    <div className={`w-full ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
        role="img"
        aria-label="1분봉 차트"
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-line"
            />
            <text
              x={width - 4}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              className="text-muted tabular"
            >
              {Math.round(v).toLocaleString('ko-KR')}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const up = b.close >= b.open
          const tone = up ? 'text-gain' : 'text-loss'
          const top = y(Math.max(b.open, b.close))
          const bodyH = Math.max(1, Math.abs(y(b.close) - y(b.open)))
          return (
            <g key={b.sourceTime} className={tone}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(b.high)}
                y2={y(b.low)}
                stroke="currentColor"
                strokeWidth={1}
              />
              <rect
                x={x(i) - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                fill="currentColor"
              />
            </g>
          )
        })}

        <text
          x={PAD.left}
          y={height - 6}
          fontSize={10}
          fill="currentColor"
          className="text-muted tabular"
        >
          {formatHhMm(bars[0].sourceTime)}
        </text>
        <text
          x={PAD.left + plotW}
          y={height - 6}
          textAnchor="end"
          fontSize={10}
          fill="currentColor"
          className="text-muted tabular"
        >
          {formatHhMm(bars[n - 1].sourceTime)}
        </text>
      </svg>
    </div>
  )
}
