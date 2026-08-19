// 라이브러리 없이 인라인 SVG 로 캔들·거래량을 그리고 호버 십자선·상세 툴팁을 제공하는 차트
import { useEffect, useRef, useState } from 'react'
import { parseLocalDateTime } from '../lib/datetime'
import type { Candle, CandleInterval } from '../services/types'

interface ReferenceLine {
  value: number
  tone: 'gain' | 'loss'
  label: string
}

interface CandleChartProps {
  candles: Candle[]
  /** 데스크톱 기준 차트 높이(px). 좁은 폭에서는 자동으로 낮아진다. fillHeight 가 true 면 무시된다. */
  height?: number
  /**
   * true 면 height prop 대신 부모가 flex/grid 로 실제 내려준 높이를 측정해서 그만큼만 그린다 —
   * 세로 공간이 줄어들면 차트도 스크롤 없이 그만큼 작아진다(2026-08-19 피드백). 부모가 이 요소에
   * 실제 높이를 주는 레이아웃(예: flex-1 min-h-0)일 때만 켠다 — 안 그러면 측정값이 0 이 된다.
   */
  fillHeight?: boolean
  /** 꼬리에서 잘라 그릴 최대 봉 수 */
  maxBars?: number
  /** 축 라벨·툴팁 날짜 형식을 정한다. 기본 '1m' */
  interval?: CandleInterval
  emptyMessage?: string
  className?: string
  /**
   * 손절가·익절가처럼 캔들 데이터와 무관하게 항상 표시할 수평 참고선. 값이 현재 봉의 고가·저가
   * 범위 밖이어도 가격축 자동 맞춤에 포함시켜 항상 화면에 보이게 한다(튜토리얼 참고선 용도).
   */
  referenceLines?: ReferenceLine[]
  /**
   * 거래량 영역을 그릴지. 기본 true. false 면 하단 거래량 띠와 툴팁의 거래량 행을 아예 빼고
   * 그 높이를 캔들에 돌려준다 — 거래량이 늘 0 인 튜토리얼용 봉에서 빈 칸과 "거래량 0" 오해를 없앤다.
   */
  showVolume?: boolean
  /** svg 의 aria-describedby 로 연결할 설명 요소 id. */
  describedById?: string
  /** 툴팁 라벨을 투자 용어 대신 초보자용 문구로 바꾼다. 기본 false. */
  beginnerLabels?: boolean
}

/** right 는 가격축, bottom 은 시간축 + 거래량 영역을 담는다. */
const PAD = { top: 10, right: 58, bottom: 22, left: 8 }
/** 거래량이 차트 높이에서 차지하는 비율. 가격 흐름을 가리지 않을 만큼만 둔다. */
const VOLUME_RATIO = 0.18
/** 이 폭 아래에서는 차트를 낮추고 봉 수를 줄인다 (모바일). */
const NARROW_PX = 480
/** 이보다 적게 보여주면 봉이 서로 겹친다. */
const MIN_VISIBLE_BARS = 15
/**
 * 툴팁 히트 판정의 최소 가로 허용치(px). 봉이 얇아도 이만큼은 잡아 준다 —
 * 손가락 접지면은 보통 8~10mm 라 몸통 폭(좁은 화면에서 3px 남짓)으로는 아무도 열지 못한다.
 */
const TOUCH_SLOP_PX = 12
/** 버튼 클릭 한 번에 곱하는 배수 — 클릭은 이산적이라 큼직하게 반응해도 된다. */
const ZOOM_STEP = 1.4
/**
 * 휠 한 틱에 곱하는 배수. 트랙패드·고감도 마우스는 한 번의 스크롤 제스처에도 wheel 이벤트가
 * 여러 번(많으면 수십 번) 연달아 뜬다 — ZOOM_STEP 만큼 크게 반응하면 그 배수가 겹겹이 곱해져
 * 봉 수가 순식간에 확 튄다. 훨씬 작게 잡는다.
 */
const WHEEL_ZOOM_STEP = 1.05
/** 축소(확대 해제)가 실제로 받아온 봉 수를 넘어가지 않게 하는 상한. */
const MAX_ZOOM_OUT_BARS = 500

/**
 * 컨테이너의 실제 CSS 폭(+옵션으로 높이)을 잰다.
 * viewBox 를 고정하고 CSS 로 늘리면 SVG 좌표계가 통째로 확대·축소돼
 * 좁은 화면에서 축 라벨이 4px 까지 줄어든다 → 1 유저단위 = 1 CSS 픽셀로 고정한다.
 * 높이는 fillHeight 모드에서만 쓰므로 필요할 때만 측정한다 — 안 그러면 높이가 아직 0인
 * 첫 렌더마다 불필요한 상태 변화가 생긴다.
 */
function useElementSize<T extends HTMLElement>(measureHeight: boolean) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setWidth(rect.width)
    if (measureHeight) setHeight(rect.height)
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
      if (measureHeight) setHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [measureHeight])

  return { ref, width, height }
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

/**
 * 툴팁 머리글. 집계봉은 "무엇의 구간인지"를 밝혀야 사용자가 오해하지 않는다.
 * 일봉을 `(일)` 로 줄여 쓰면 일요일로 읽힌다 — 주기는 괄호 약어 대신 풀어서 적는다.
 */
function tooltipLabel(value: string, interval: CandleInterval): string {
  const d = parseLocalDateTime(value)
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`
  if (interval === '1m') {
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${md} ${hm}부터 1분`
  }
  if (interval === '1d') return `${md} 하루`
  if (interval === '1w') return `${md}부터 한 주`
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 한 달`
}

/**
 * 툴팁의 등락률은 그 봉의 종가를 **같은 봉의 시가**와 비교한 값이다(아래 activeChange).
 * 초보자에게는 "무엇 대비인지"를 밝혀 줘야 전일 대비로 오해하지 않는다.
 */
function changeBasisLabel(interval: CandleInterval): string {
  if (interval === '1m') return '그 1분 시작가 대비'
  if (interval === '1d') return '그날 시작가 대비'
  if (interval === '1w') return '그 주 시작가 대비'
  return '그달 시작가 대비'
}

const won = (v: number) => Math.round(v).toLocaleString('ko-KR')

export function CandleChart({
  candles,
  height = 260,
  fillHeight = false,
  maxBars = 120,
  interval = '1m',
  emptyMessage = '표시할 봉이 없습니다.',
  className = '',
  referenceLines,
  showVolume = true,
  describedById,
  beginnerLabels = false,
}: CandleChartProps) {
  const {
    ref,
    width: boxWidth,
    height: boxHeight,
  } = useElementSize<HTMLDivElement>(fillHeight)
  const svgRef = useRef<SVGSVGElement>(null)
  /** 호버 중인 봉의 인덱스. 터치·이탈 시 null. */
  const [hover, setHover] = useState<number | null>(null)
  /** 화면에 펼쳐 보여줄 봉 수. null 이면 "기본값 사용"(주기 전환 시 이 상태로 되돌아간다). */
  const [shownBars, setShownBars] = useState<number | null>(null)
  /** 오른쪽 끝을 최신 봉에서 몇 개 뒤로 물릴지. 0 이면 항상 최신 봉까지 보여준다(드래그 팬). */
  const [offset, setOffset] = useState(0)
  /** 가격축을 자동 맞춤 창에서 위·아래로 얼마나(원) 밀었는지. 0 이면 자동 맞춤 그대로다. */
  const [priceShift, setPriceShift] = useState(0)
  /** 핀치 줌 중 직전 두 손가락 거리(px). 핀치가 아니면 null. */
  const pinchDistRef = useRef<number | null>(null)
  /** 좌클릭 드래그 팬 중 시작 지점 — 가로는 봉 오프셋, 세로는 가격축 이동에 각각 대응한다. */
  const dragRef = useRef<{
    startX: number
    startOffset: number
    startY: number
    startPriceShift: number
    startSpan: number
  } | null>(null)
  /** 커서 스타일(grab/grabbing) 전환용 — 로직은 dragRef 가 정본이다. */
  const [isDragging, setIsDragging] = useState(false)
  /**
   * 네이티브 리스너(아래 useEffect들)가 항상 최신 확대·팬 상태를 읽게 하는 창구.
   * render 도중 ref를 직접 갱신한다 — 이 값 때문에 다시 그릴 필요는 없어 state로 두지 않는다.
   */
  const zoomRangeRef = useRef({ visibleBars: 0, zoomCap: 0, maxOffset: 0, barW: 0, offset: 0 })

  // 봉 주기(분/일/주/월)가 바뀌면 이전 확대·팬 상태가 새 주기에서는 의미가 없다 — 기본값으로 되돌린다.
  useEffect(() => {
    setShownBars(null)
    setOffset(0)
    setPriceShift(0)
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
      if (e.touches.length === 2) {
        pinchDistRef.current = distance(e.touches)
        // 핀치를 시작하면 첫 손가락이 탭으로 열어 둔 툴팁은 방해만 된다.
        setHover(null)
      }
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
      if (e.deltaX === 0 && e.deltaY === 0) return
      /**
       * 트랙패드 두 손가락 좌우 스와이프는 deltaX로 온다 — 대부분 deltaY도 약간 같이 섞여
       * 들어오므로, 둘 중 더 큰 축을 그 제스처의 의도로 본다(좌우 스와이프 = 팬, 상하 = 확대).
       * deltaX 부호가 "오른쪽으로 스크롤 = 더 최근 쪽으로 이동"이 되도록 맞췄다 — 실기기
       * 트랙패드로 방향을 검증하지 못해 반대로 느껴지면 이 부호만 뒤집으면 된다.
       */
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const { barW: currentBarW, offset: currentOffset, maxOffset: currentMaxOffset } = zoomRangeRef.current
        if (currentBarW <= 0) return
        const deltaBars = Math.round(e.deltaX / currentBarW)
        if (deltaBars === 0) return
        setOffset(Math.min(currentMaxOffset, Math.max(0, currentOffset - deltaBars)))
        return
      }
      const { visibleBars, zoomCap } = zoomRangeRef.current
      const factor = e.deltaY < 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP
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
  if (boxWidth === 0 || (fillHeight && boxHeight === 0)) {
    return (
      <div
        ref={ref}
        className={`w-full ${fillHeight ? 'h-full' : ''} ${className}`}
        style={fillHeight ? undefined : { height }}
      />
    )
  }

  const narrow = boxWidth < NARROW_PX
  const width = Math.round(boxWidth)
  // fillHeight 는 부모가 flex/grid 로 실제 내려준 높이를 그대로 쓴다 — narrow 축소(0.72배)는
  // height prop 이 고정값일 때 모바일 비율을 잡으려는 용도라 여기서는 적용하지 않는다.
  const chartH = fillHeight ? Math.round(boxHeight) : narrow ? Math.round(height * 0.72) : height
  // 좁은 화면에서 120봉을 그리면 봉 하나가 2px 미만이 된다 — 기본값은 더 적게 잡는다.
  const baseBars = narrow ? Math.min(maxBars, 60) : maxBars
  // 확대·축소는 실제 받아온 봉 수 안에서만 가능하다. MIN_VISIBLE_BARS 아래로는 봉이 서로 겹친다.
  const zoomCap = Math.min(MAX_ZOOM_OUT_BARS, candles.length)
  const visibleBars = Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, shownBars ?? baseBars))
  // 드래그로 과거로 물러날 수 있는 한도 — 창이 보유한 봉 수를 넘어가면 안 된다.
  const maxOffset = Math.max(0, candles.length - visibleBars)
  const clampedOffset = Math.min(maxOffset, Math.max(0, offset))
  // barW·offset은 아직 계산 전이라 이전 값을 임시로 이어 둔다 — 아래에서 곧바로 최신값으로 덮어쓴다.
  zoomRangeRef.current = {
    visibleBars,
    zoomCap,
    maxOffset,
    barW: zoomRangeRef.current.barW,
    offset: zoomRangeRef.current.offset,
  }
  const windowEnd = candles.length - clampedOffset
  const bars = candles.slice(Math.max(0, windowEnd - visibleBars), windowEnd)
  const n = bars.length
  const plotW = width - PAD.left - PAD.right
  const fullH = chartH - PAD.top - PAD.bottom
  // 거래량을 감추면 그 높이(구분 여백 6px 포함)를 캔들에 그대로 돌려준다.
  const volH = showVolume ? Math.round(fullH * VOLUME_RATIO) : 0
  const plotH = showVolume ? fullH - volH - 6 : fullH

  if (n === 0) {
    return (
      <div ref={ref} className={`w-full ${fillHeight ? 'h-full' : ''} ${className}`}>
        <svg
          viewBox={`0 0 ${width} ${chartH}`}
          width="100%"
          height={chartH}
          role="img"
          aria-label="캔들 차트 (데이터 없음)"
          aria-describedby={describedById}
        >
          <text x={width / 2} y={chartH / 2} textAnchor="middle" fontSize={13} fill="currentColor" className="text-muted">
            {emptyMessage}
          </text>
        </svg>
      </div>
    )
  }

  const refValues = referenceLines?.map((r) => r.value) ?? []
  let lo = Math.min(...bars.map((b) => b.low), ...refValues)
  let hi = Math.max(...bars.map((b) => b.high), ...refValues)
  // 시드 데이터나 봉 1개면 hi === lo 가 될 수 있어 0 나눗셈을 막는다.
  const span = hi - lo || Math.max(Math.abs(hi) * 0.001, 1)
  const pad = span * 0.08
  // 월봉처럼 범위가 넓으면 여백이 0 아래로 내려가 가격축에 음수가 찍힌다 — 가격은 음수가 될 수 없다.
  lo = Math.max(0, lo - pad)
  hi += pad
  /**
   * 세로 드래그로 가격축을 위아래로 밀 수 있다 — 자동 맞춤 창 위에 얹는 오프셋이다.
   * 한도 없이 밀리면 봉이 플롯 영역 밖으로 완전히 사라진다 — 자동 맞춤 스팬의 60% 까지만
   * 허용해, 끝까지 밀어도 원래 범위의 상당 부분이 화면에 남는다.
   */
  const maxPriceShift = (hi - lo) * 0.6
  const clampedPriceShift = Math.max(-maxPriceShift, Math.min(maxPriceShift, priceShift))
  lo += clampedPriceShift
  hi += clampedPriceShift

  const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH
  const barW = plotW / n
  const x = (i: number) => PAD.left + (i + 0.5) * barW
  const bodyW = Math.max(1, barW * 0.62)
  // 네이티브 휠 리스너(트랙패드 좌우 스와이프)가 최신 값을 읽을 창구 — effect 재실행 없이 갱신한다.
  zoomRangeRef.current.barW = barW
  zoomRangeRef.current.offset = clampedOffset

  const maxVol = Math.max(...bars.map((b) => b.volume), 1)
  const volTop = PAD.top + plotH + 6
  const volY = (v: number) => volTop + volH - (v / maxVol) * volH
  /** 십자선·터치 판정이 닿는 아래 끝. 거래량을 감추면 캔들 영역 바닥이 곧 끝이다. */
  const plotBottom = showVolume ? volTop + volH : PAD.top + plotH

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
  /** 툴팁 네 줄. 초보자 모드에서는 투자 용어 대신 뜻이 그대로 보이는 말로 바꾼다. */
  const tooltipRows: [string, number][] =
    active === null
      ? []
      : beginnerLabels
        ? [
            ['시작가', active.open],
            ['최고', active.high],
            ['최저', active.low],
            ['끝난값', active.close],
          ]
        : [
            ['시가', active.open],
            ['고가', active.high],
            ['저가', active.low],
            ['종가', active.close],
          ]

  /**
   * 참고선 라벨의 세로 위치를 미리 잡는다. 기본은 선 위지만, 바로 위 라벨과 겹치면 선 아래로,
   * 그래도 겹치면 앞 라벨 바로 밑으로 밀어 둘 다 읽히게 한다. 손절·익절이 몇 % 차이면
   * 두 선이 10px 안쪽으로 붙어 라벨끼리 포개지던 문제를 없앤다.
   */
  const REF_CHIP_H = 14
  let refChipBottom = -Infinity
  const refLabels = (referenceLines ?? [])
    .map((r) => ({ ...r, lineY: y(r.value) }))
    .sort((a, b) => a.lineY - b.lineY)
    .map((r) => {
      let chipY = r.lineY - REF_CHIP_H - 3
      if (chipY < refChipBottom + 2) chipY = r.lineY + 3
      if (chipY < refChipBottom + 2) chipY = refChipBottom + 2
      chipY = Math.min(Math.max(chipY, PAD.top), PAD.top + plotH - REF_CHIP_H)
      refChipBottom = chipY + REF_CHIP_H
      return { ...r, chipY }
    })

  /**
   * 포인터 좌표를 봉 인덱스로 바꾼다. 닿는 곳이 없으면 null.
   *
   * 예전에는 "실제 캔들(몸통 폭 × 고가~저가)" 위에서만 잡았는데, 30봉·375px 화면이면 가로
   * 허용 오차가 ±3px 남짓이라 손가락으로는 사실상 열 수 없었다 — 세로 판정은 없애고 플롯
   * 영역 전체로, 가로는 최소 TOUCH_SLOP_PX 까지 넓힌다.
   */
  const hitIndexAt = (clientX: number, clientY: number, rect: DOMRect): number | null => {
    const px = ((clientX - rect.left) / rect.width) * width
    const py = ((clientY - rect.top) / rect.height) * chartH
    if (py < PAD.top || py > plotBottom) return null
    const idx = Math.floor((px - PAD.left) / barW)
    if (idx < 0 || idx >= n) return null
    return Math.abs(px - x(idx)) <= Math.max(TOUCH_SLOP_PX, bodyW / 2) ? idx : null
  }

  /**
   * 포인터 x·y 좌표를 각각 봉 인덱스(호버)·확대·팬으로 바꾼다.
   * 드래그 중이면 가로는 좌우 이동(봉 오프셋), 세로는 가격축 이동을 함께 처리한다.
   */
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (dragRef.current) {
      const deltaPxX = e.clientX - dragRef.current.startX
      const deltaBars = Math.round(((deltaPxX / rect.width) * width) / barW)
      setOffset(
        Math.min(zoomRangeRef.current.maxOffset, Math.max(0, dragRef.current.startOffset + deltaBars)),
      )
      // 화면 세로 픽셀 → 원 단위. 드래그 시작 시점의 가격 스팬·plotH를 기준으로 고정해
      // 드래그 도중 실시간 가격 갱신으로 스팬이 흔들려도 손 움직임과 반응이 어긋나지 않게 한다.
      const deltaPxY = e.clientY - dragRef.current.startY
      const deltaPrice = (deltaPxY / plotH) * dragRef.current.startSpan
      // 렌더의 clamp(maxPriceShift 기준)와 같은 한도로 여기서도 막아야 한다 — 안 그러면 한계
      // 너머로 계속 끌다 되돌릴 때, 실제로 안 보이는 값까지 따라잡느라 한동안 반응이 없어진다.
      setPriceShift(
        Math.max(-maxPriceShift, Math.min(maxPriceShift, dragRef.current.startPriceShift + deltaPrice)),
      )
      return
    }
    // 두 손가락 핀치 중에는 손가락마다 pointermove 가 따로 와서 툴팁이 제멋대로 튄다 — 건너뛴다.
    if (e.pointerType !== 'mouse' && pinchDistRef.current !== null) return
    setHover(hitIndexAt(e.clientX, e.clientY, rect))
  }

  /**
   * 마우스는 좌클릭 드래그로 차트를 상하좌우로 밀고, 터치는 누른 자리의 봉 툴팁을 연다.
   * 터치에서 드래그 팬을 붙이지 않는 이유는 세로 스와이프를 페이지 스크롤로 남겨 두기 위해서다.
   */
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') {
      if (pinchDistRef.current !== null) return
      setHover(hitIndexAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
      return
    }
    if (e.button !== 0) return
    dragRef.current = {
      startX: e.clientX,
      startOffset: clampedOffset,
      startY: e.clientY,
      startPriceShift: priceShift,
      startSpan: hi - lo,
    }
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
  // 초보자 모드는 "그날 시작가 대비" 같은 설명 줄이 붙어 조금 더 넓어야 덜 접힌다.
  const tipW = beginnerLabels ? 196 : 178
  const tipFlip = active !== null && hover !== null && x(hover) + tipW + 12 > PAD.left + plotW

  const applyZoom = (factor: number) => {
    setShownBars(Math.min(zoomCap, Math.max(MIN_VISIBLE_BARS, Math.round(visibleBars * factor))))
  }
  const canZoomIn = visibleBars > MIN_VISIBLE_BARS
  const canZoomOut = visibleBars < zoomCap
  const isModified = visibleBars !== baseBars || clampedOffset > 0 || priceShift !== 0
  const resetView = () => {
    setShownBars(null)
    setOffset(0)
    setPriceShift(0)
  }

  return (
    <div ref={ref} className={`relative w-full ${fillHeight ? 'h-full' : ''} ${className}`}>
      {/* 확대·축소·이동 — 차트 위 휠·좌클릭 드래그, 모바일 두 손가락 핀치, 버튼까지 함께 지원한다. */}
      <div className="absolute right-1 -top-10 z-10 flex items-center gap-1">
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
      {/*
        touch-pan-y 는 세로 스와이프를 브라우저에 넘겨 페이지 스크롤을 살리고 가로·핀치만
        우리가 가져간다 — 예전 touch-none 은 차트 위에서 페이지가 아예 안 내려갔다.
      */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${chartH}`}
        width="100%"
        height={chartH}
        role="img"
        aria-label="캔들 차트"
        aria-describedby={describedById}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={(e) => {
          // 브라우저가 세로 스크롤로 제스처를 가져가면 pointercancel 이 온다 —
          // 스크롤하려다 열린 툴팁은 여기서 치운다.
          if (e.pointerType !== 'mouse') setHover(null)
          endDrag(e)
        }}
        onPointerLeave={(e) => {
          // 터치는 손을 떼는 순간 pointerleave 까지 뒤따라 온다 — 여기서 지우면 탭으로 연 툴팁이
          // 읽기도 전에 사라진다. 터치 툴팁은 다음 탭이나 리렌더까지 그대로 둔다.
          if (e.pointerType === 'mouse') setHover(null)
          endDrag(e)
        }}
        className={`touch-pan-y select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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

        {/*
          손절가·익절가 등 데이터와 무관한 참고선 — 캔들보다 아래, 가격 그리드보다 위에 둔다.
          라벨은 캔들 위에 겹쳐 그려지므로 배경 칩을 깔아야 읽힌다(세로 위치는 refLabels 참고).
        */}
        {refLabels.map((r) => {
          const tone = r.tone === 'gain' ? 'text-gain' : 'text-loss'
          const text = `${r.label} ${won(r.value)}`
          // 한글·숫자 혼용이라 정확한 폭을 알 수 없다 — 글자당 6.6px 로 넉넉히 잡는다.
          const chipW = text.length * 6.6 + 10
          return (
            <g key={r.label}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={r.lineY}
                y2={r.lineY}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="4 3"
                className={tone}
                opacity={0.6}
              />
              <rect
                x={PAD.left + 2}
                y={r.chipY}
                width={chipW}
                height={REF_CHIP_H}
                rx={3}
                fill="currentColor"
                className="text-canvas"
                opacity={0.78}
              />
              <text
                x={PAD.left + 7}
                y={r.chipY + 10.5}
                fontSize={11}
                fontWeight={600}
                fill="currentColor"
                className={tone}
              >
                {text}
              </text>
            </g>
          )
        })}

        {/* 거래량 */}
        {showVolume &&
          bars.map((b, i) => {
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

        {/* 캔들 — 진행 중(미마감) 봉은 점선 외곽선 + "진행 중" 라벨로 끝난 봉과 구분한다 */}
        {bars.map((b, i) => {
          const up = b.close >= b.open
          const tone = up ? 'text-gain' : 'text-loss'
          const top = y(Math.max(b.open, b.close))
          const bodyH = Math.max(1, Math.abs(y(b.close) - y(b.open)))
          const dim = hover !== null && hover !== i
          const running = b.current === true
          return (
            <g key={b.sourceTime} className={tone} opacity={dim ? 0.45 : 1}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(b.high)}
                y2={y(b.low)}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={running ? '3 2' : undefined}
              />
              <rect
                x={x(i) - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                fill="currentColor"
                fillOpacity={running ? 0.3 : 1}
                stroke={running ? 'currentColor' : undefined}
                strokeWidth={running ? 1.2 : undefined}
                strokeDasharray={running ? '3 2' : undefined}
              />
              {running && (
                <text
                  x={Math.min(x(i) + bodyW / 2 + 3, PAD.left + plotW)}
                  y={Math.max(y(b.high) - 5, PAD.top + 8)}
                  textAnchor={x(i) > PAD.left + plotW * 0.75 ? 'end' : 'start'}
                  fontSize={9}
                  fontWeight={600}
                  fill="currentColor"
                >
                  진행 중
                </text>
              )}
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
              y2={plotBottom}
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
          role="status"
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
          {beginnerLabels && (
            <p className="mt-0.5 text-[10px] leading-tight text-muted">
              {changeBasisLabel(interval)}
            </p>
          )}
          <dl className="mt-1.5 space-y-0.5 text-[10px]">
            {tooltipRows.map(([label, v]) => (
              <div key={label} className="flex justify-between gap-1">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular text-ink">{won(v)}</dd>
              </div>
            ))}
          </dl>
          {/* 거래량을 감춘 차트에서 "거래량 0" 을 띄우면 사실이 아닌 정보를 알려 주는 셈이다. */}
          {showVolume && (
            <p className="mt-1 flex justify-between text-[10px]">
              <span className="text-muted">거래량</span>
              <span className="tabular text-ink">
                {active.volume.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}
              </span>
            </p>
          )}
          {beginnerLabels && active.current === true && (
            <p className="mt-1.5 text-[10px] leading-tight text-muted">
              이 막대는 아직 진행 중이라 값이 계속 바뀝니다.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
