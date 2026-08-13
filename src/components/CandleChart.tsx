// 라이브러리 없이 인라인 SVG 로 캔들·거래량을 그리고 호버 십자선·상세 툴팁을 제공하는 차트
import { useEffect, useRef, useState } from 'react'
import { parseLocalDateTime } from '../lib/datetime'
import type { Candle, CandleInterval } from '../services/types'

interface CandleChartProps {
  candles: Candle[]
  /** 데스크톱 기준 차트 높이(px). 좁은 폭에서는 자동으로 낮아진다. */
  height?: number
  /** 꼬리에서 잘라 그릴 최대 봉 수 */
  maxBars?: number
  /** 축 라벨·툴팁 날짜 형식을 정한다. 기본 '1m' */
  interval?: CandleInterval
  emptyMessage?: string
  className?: string
}

/** right 는 가격축, bottom 은 시간축 + 거래량 영역을 담는다. */
const PAD = { top: 10, right: 58, bottom: 22, left: 8 }
/** 거래량이 차트 높이에서 차지하는 비율. 가격 흐름을 가리지 않을 만큼만 둔다. */
const VOLUME_RATIO = 0.18
/** 이 폭 아래에서는 차트를 낮추고 봉 수를 줄인다 (모바일). */
const NARROW_PX = 480
/** 이보다 적게 보여주면 봉이 서로 겹친다. */
const MIN_VISIBLE_BARS = 15
/** 확대·축소 한 번에 곱하는 배수. */
const ZOOM_STEP = 1.4
/** 축소(확대 해제)가 실제로 받아온 봉 수를 넘어가지 않게 하는 상한. */
const MAX_ZOOM_OUT_BARS = 500

/**
 * 컨테이너의 실제 CSS 폭을 잰다.
 * viewBox 를 고정하고 CSS 로 늘리면 SVG 좌표계가 통째로 확대·축소돼
 * 좁은 화면에서 축 라벨이 4px 까지 줄어든다 → 1 유저단위 = 1 CSS 픽셀로 고정한다.
 */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * 주기별 축 라벨. 집계봉에 HH:mm 을 쓰면 sourceTime 이 버킷 시작 00:00:00 이라
 * 모든 봉이 "00:00" 으로 찍힌다 — 실제로 있었던 버그다.
 */
function axisLabel(value: string, interval: CandleInterval, multiYear: boolean): string {
  const d = parseLocalDateTime(value)
  if (interval === '1m') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (interval === '1M') return `${d.getFullYear()}.${d.getMonth() + 1}`
  // 주봉·일봉이 여러 해에 걸치면 M/D 만으로는 순서가 뒤죽박죽으로 읽힌다 → 두 자리 연도를 붙인다.
  if (multiYear) {
    return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 툴팁 머리글. 집계봉은 "무엇의 구간인지"를 밝혀야 사용자가 오해하지 않는다. */
function tooltipLabel(value: string, interval: CandleInterval): string {
  const d = parseLocalDateTime(value)
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`
  if (interval === '1m') {
    return `${md} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (interval === '1d') return `${md} (일)`
  if (interval === '1w') return `${md} 주간`
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

const won = (v: number) => Math.round(v).toLocaleString('ko-KR')

export function CandleChart({
  candles,
  height = 260,
  maxBars = 120,
  interval = '1m',
  emptyMessage = '표시할 봉이 없습니다.',
  className = '',
}: CandleChartProps) {
  const { ref, width: boxWidth } = useElementWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  /** 호버 중인 봉의 인덱스. 터치·이탈 시 null. */
  const [hover, setHover] = useState<number | null>(null)
  /** 화면에 펼쳐 보여줄 봉 수. null 이면 "기본값 사용"(주기 전환 시 이 상태로 되돌아간다). */
  const [shownBars, setShownBars] = useState<number | null>(null)
  /** 오른쪽 끝을 최신 봉에서 몇 개 뒤로 물릴지. 0 이면 항상 최신 봉까지 보여준다(드래그 팬). */
  const [offset, setOffset] = useState(0)
  /** 핀치 줌 중 직전 두 손가락 거리(px). 핀치가 아니면 null. */
  const pinchDistRef = useRef<number | null>(null)
  /** 좌클릭 드래그 팬 중 시작 지점의 clientX·offset. 드래그 중이 아니면 null. */
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null)
  /** 커서 스타일(grab/grabbing) 전환용 — 로직은 dragRef 가 정본이다. */
  const [isDragging, setIsDragging] = useState(false)
  /**
   * 네이티브 리스너(아래 useEffect들)가 항상 최신 확대·팬 상태를 읽게 하는 창구.
   * render 도중 ref를 직접 갱신한다 — 이 값 때문에 다시 그릴 필요는 없어 state로 두지 않는다.
   */
  const zoomRangeRef = useRef({ visibleBars: 0, zoomCap: 0, maxOffset: 0 })

  // 봉 주기(분/일/주/월)가 바뀌면 이전 확대·팬 상태가 새 주기에서는 의미가 없다 — 기본값으로 되돌린다.
  useEffect(() => {
    setShownBars(null)
    setOffset(0)
  }, [interval])

  /**
   * 핀치 줌 + 마우스 휠 줌. React의 onTouchMove·onWheel은 브라우저가 passive 리스너로 등록해
   * preventDefault가 무시된다(경고만 뜨고 그대로 페이지가 확대·스크롤된다) — 네이티브 리스너를
   * { passive: false }로 직접 붙여야 제스처 중 페이지가 같이 움직이는 걸 막을 수 있다.
   *
   * boxWidth 뿐 아니라 candles.length 에도 의존해야 한다 — 봉이 아예 없는 시장(장 마감 등)은
   * <svg ref={svgRef}> 자체가 없는 "빈 상태" 분기를 반환한다(아래 n===0 조기 반환). boxWidth가
   * 이미 측정된 채로 그 상태에 머물다가 나중에 봉이 생겨(예: 코인 탭으로 전환) 실제 차트로
   * 바뀌어도 boxWidth 자체는 그대로라 이 effect가 다시 돌지 않아 리스너가 영영 안 붙는다 —
   * 실제로 겪은 버그다(이슈 없음, 이 커밋 리뷰에서 발견).
   */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchDistRef.current = distance(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const dist = distance(e.touches)
      const prev = pinchDistRef.current
      if (prev !== null && prev > 0) {
        const { visibleBars, zoomCap } = zoomRangeRef.current
        const next = Math.round(visibleBars * (prev / dist))
        setShownBars(Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, next)))
      }
      pinchDistRef.current = dist
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDistRef.current = null
    }
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      if (e.deltaY === 0) return
      const { visibleBars, zoomCap } = zoomRangeRef.current
      const factor = e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      setShownBars(Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, Math.round(visibleBars * factor))))
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('wheel', onWheelNative)
    }
  }, [boxWidth, candles.length])

  // 첫 페인트에는 폭을 아직 모른다. 자리만 잡아 두고 측정 후 그린다.
  if (boxWidth === 0) {
    return <div ref={ref} className={`w-full ${className}`} style={{ height }} />
  }

  const narrow = boxWidth < NARROW_PX
  const width = Math.round(boxWidth)
  const chartH = narrow ? Math.round(height * 0.72) : height
  // 좁은 화면에서 120봉을 그리면 봉 하나가 2px 미만이 된다 — 기본값은 더 적게 잡는다.
  const baseBars = narrow ? Math.min(maxBars, 60) : maxBars
  // 확대·축소는 실제 받아온 봉 수 안에서만 가능하다. MIN_VISIBLE_BARS 아래로는 봉이 서로 겹친다.
  const zoomCap = Math.min(MAX_ZOOM_OUT_BARS, candles.length)
  const visibleBars = Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, shownBars ?? baseBars))
  // 드래그로 과거로 물러날 수 있는 한도 — 창이 보유한 봉 수를 넘어가면 안 된다.
  const maxOffset = Math.max(0, candles.length - visibleBars)
  const clampedOffset = Math.min(maxOffset, Math.max(0, offset))
  zoomRangeRef.current = { visibleBars, zoomCap, maxOffset }
  const windowEnd = candles.length - clampedOffset
  const bars = candles.slice(Math.max(0, windowEnd - visibleBars), windowEnd)
  const n = bars.length
  const plotW = width - PAD.left - PAD.right
  const fullH = chartH - PAD.top - PAD.bottom
  const volH = Math.round(fullH * VOLUME_RATIO)
  const plotH = fullH - volH - 6

  if (n === 0) {
    return (
      <div ref={ref} className={`w-full ${className}`}>
        <svg viewBox={`0 0 ${width} ${chartH}`} width="100%" height={chartH} role="img" aria-label="캔들 차트 (데이터 없음)">
          <text x={width / 2} y={chartH / 2} textAnchor="middle" fontSize={13} fill="currentColor" className="text-muted">
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
  const pad = span * 0.08
  // 월봉처럼 범위가 넓으면 여백이 0 아래로 내려가 가격축에 음수가 찍힌다 — 가격은 음수가 될 수 없다.
  lo = Math.max(0, lo - pad)
  hi += pad

  const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH
  const barW = plotW / n
  const x = (i: number) => PAD.left + (i + 0.5) * barW
  const bodyW = Math.max(1, barW * 0.62)

  const maxVol = Math.max(...bars.map((b) => b.volume), 1)
  const volTop = PAD.top + plotH + 6
  const volY = (v: number) => volTop + volH - (v / maxVol) * volH

  // 가격축 4단. 두 개(고·저)만 있으면 중간 가격을 눈으로 못 읽는다.
  const levels = [0, 1, 2, 3].map((k) => hi - ((hi - lo) / 3) * k)
  const last = bars[n - 1]
  const first = bars[0]
  const lastUp = last.close >= first.open
  // 라벨에 연도를 붙일지 판단한다. 주봉·월봉은 흔히 여러 해에 걸친다.
  const multiYear =
    parseLocalDateTime(first.sourceTime).getFullYear() !==
    parseLocalDateTime(last.sourceTime).getFullYear()

  // 시간축 라벨을 3~5개 균등 배치한다. 양 끝만 찍으면 중간 시각을 알 수 없다.
  const tickCount = narrow ? 3 : 5
  const tickIdx = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k * (n - 1)) / (tickCount - 1)),
  ).filter((v, k, arr) => arr.indexOf(v) === k)

  const active = hover !== null && hover >= 0 && hover < n ? bars[hover] : null
  const activeChange =
    active !== null && active.open !== 0 ? ((active.close - active.open) / active.open) * 100 : 0

  /** 포인터 x 좌표를 봉 인덱스로 바꾼다. 드래그 중이면 호버 대신 좌우 이동(팬)을 처리한다. */
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (dragRef.current) {
      const deltaPx = e.clientX - dragRef.current.startX
      const deltaBars = Math.round(((deltaPx / rect.width) * width) / barW)
      setOffset(
        Math.min(zoomRangeRef.current.maxOffset, Math.max(0, dragRef.current.startOffset + deltaBars)),
      )
      return
    }
    const px = ((e.clientX - rect.left) / rect.width) * width
    const idx = Math.floor((px - PAD.left) / barW)
    setHover(idx >= 0 && idx < n ? idx : null)
  }

  /** 좌클릭(마우스 전용 — 터치는 핀치가 이미 두 손가락을 쓴다) 드래그로 차트를 좌우로 민다. */
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    dragRef.current = { startX: e.clientX, startOffset: clampedOffset }
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // 툴팁이 오른쪽 가격축을 넘어가지 않게 좌우를 뒤집는다.
  const tipW = 178
  const tipFlip = active !== null && hover !== null && x(hover) + tipW + 12 > PAD.left + plotW

  const applyZoom = (factor: number) => {
    setShownBars(Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, Math.round(visibleBars * factor))))
  }
  const canZoomIn = visibleBars > MIN_VISIBLE_BARS
  const canZoomOut = visibleBars < zoomCap
  const isModified = visibleBars !== baseBars || clampedOffset > 0
  const resetView = () => {
    setShownBars(null)
    setOffset(0)
  }

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      {/* 확대·축소·이동 — 차트 위 휠·좌클릭 드래그, 모바일 두 손가락 핀치, 버튼까지 함께 지원한다. */}
      <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
        {isModified && (
          <button
            type="button"
            onClick={resetView}
            className="rounded-full bg-canvas/80 px-2 py-1 text-[10px] text-muted ring-1 ring-white/[0.08] transition-colors hover:text-ink"
          >
            초기화
          </button>
        )}
        <button
          type="button"
          onClick={() => applyZoom(ZOOM_STEP)}
          disabled={!canZoomOut}
          aria-label="차트 축소"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas/80 text-xs text-muted ring-1 ring-white/[0.08] transition-colors hover:text-ink disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1 / ZOOM_STEP)}
          disabled={!canZoomIn}
          aria-label="차트 확대"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas/80 text-xs text-muted ring-1 ring-white/[0.08] transition-colors hover:text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${chartH}`}
        width="100%"
        height={chartH}
        role="img"
        aria-label="캔들 차트"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => {
          setHover(null)
          endDrag(e)
        }}
        className={`touch-none select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <defs>
          {/* 마지막 종가 기준 은은한 배경 — 상승/하락 톤을 배경에서도 느끼게 한다 */}
          <linearGradient id="candle-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lastUp ? '#FB7185' : '#60A5FA'} stopOpacity="0.055" />
            <stop offset="100%" stopColor={lastUp ? '#FB7185' : '#60A5FA'} stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="url(#candle-bg)" />

        {/* 가격 그리드 — 점선으로 낮춰 봉이 주인공이 되게 한다 */}
        {levels.map((v, k) => (
          <g key={k}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="2 4"
              className="text-line"
            />
            <text
              x={width - 6}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              className="text-muted tabular"
            >
              {won(v)}
            </text>
          </g>
        ))}

        {/* 거래량 */}
        {bars.map((b, i) => {
          const up = b.close >= b.open
          return (
            <rect
              key={`v-${b.sourceTime}`}
              x={x(i) - bodyW / 2}
              y={volY(b.volume)}
              width={bodyW}
              height={Math.max(0.5, volTop + volH - volY(b.volume))}
              fill="currentColor"
              className={up ? 'text-gain' : 'text-loss'}
              opacity={0.28}
            />
          )
        })}

        {/* 캔들 */}
        {bars.map((b, i) => {
          const up = b.close >= b.open
          const tone = up ? 'text-gain' : 'text-loss'
          const top = y(Math.max(b.open, b.close))
          const bodyH = Math.max(1, Math.abs(y(b.close) - y(b.open)))
          const dim = hover !== null && hover !== i
          return (
            <g key={b.sourceTime} className={tone} opacity={dim ? 0.45 : 1}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke="currentColor" strokeWidth={1} />
              <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} fill="currentColor" />
            </g>
          )
        })}

        {/* 마지막 종가 — 점선 + 가격축 칩. 지금 값이 어디인지 한눈에 보이게 한다 */}
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={y(last.close)}
          y2={y(last.close)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          className={lastUp ? 'text-gain' : 'text-loss'}
          opacity={0.7}
        />
        <rect
          x={PAD.left + plotW + 2}
          y={y(last.close) - 8}
          width={PAD.right - 6}
          height={16}
          rx={4}
          fill="currentColor"
          className={lastUp ? 'text-gain' : 'text-loss'}
        />
        <text
          x={width - 6}
          y={y(last.close) + 3.5}
          textAnchor="end"
          fontSize={10}
          fontWeight={600}
          fill="#0A0A0B"
          className="tabular"
        >
          {won(last.close)}
        </text>

        {/* 시간축 */}
        {tickIdx.map((i) => (
          <text
            key={`t-${i}`}
            x={Math.min(Math.max(x(i), PAD.left + 14), PAD.left + plotW - 14)}
            y={chartH - 6}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            className="text-muted tabular"
          >
            {axisLabel(bars[i].sourceTime, interval, multiYear)}
          </text>
        ))}

        {/* 십자선 */}
        {active !== null && hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={volTop + volH}
              stroke="currentColor"
              strokeWidth={1}
              className="text-brand"
              opacity={0.55}
            />
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(active.close)}
              y2={y(active.close)}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="2 3"
              className="text-brand"
              opacity={0.4}
            />
          </>
        )}
      </svg>

      {/*
        툴팁은 SVG 안의 <text> 가 아니라 HTML 오버레이다 —
        SVG 텍스트는 줄바꿈·정렬이 어렵고 좁은 화면에서 글자 크기가 어긋난다.
      */}
      {active !== null && hover !== null && (
        <div
          className="glass pointer-events-none absolute z-10 px-3 py-2"
          style={{
            left: tipFlip ? undefined : `${((x(hover) + 10) / width) * 100}%`,
            right: tipFlip ? `${((width - x(hover) + 10) / width) * 100}%` : undefined,
            top: 6,
            width: tipW,
          }}
        >
          <p className="text-[10px] text-muted">{tooltipLabel(active.sourceTime, interval)}</p>
          <p
            className={`mt-0.5 text-sm font-semibold tabular ${
              active.close >= active.open ? 'text-gain' : 'text-loss'
            }`}
          >
            {won(active.close)}
            <span className="ml-1.5 text-[10px] font-medium">
              {activeChange >= 0 ? '+' : ''}
              {activeChange.toFixed(2)}%
            </span>
          </p>
          <dl className="mt-1.5 space-y-0.5 text-[10px]">
            {[
              ['시가', active.open],
              ['고가', active.high],
              ['저가', active.low],
              ['종가', active.close],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between gap-1">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular text-ink">{won(v as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 flex justify-between text-[10px]">
            <span className="text-muted">거래량</span>
            <span className="tabular text-ink">
              {active.volume.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
