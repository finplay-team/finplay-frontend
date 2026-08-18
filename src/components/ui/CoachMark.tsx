// 화면을 덮지 않고 대상 요소 하나만 꼬리 달린 말풍선으로 가리켜 알려 주는 코치마크 (읽고 닫으면 끝)
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Close } from './icons'

interface Props {
  /** 가리킬 요소의 data-coach 속성값. 예: 'price-bar' → [data-coach="price-bar"] */
  target: string
  title: string
  body: string
  /**
   * false면 아무것도 렌더하지 않는다. "이미 봤는지"·"몇 번째를 띄울 차례인지"는 화면마다 정책이
   * 달라서 이 컴포넌트가 알 필요가 없다 — 부모가 판단해 이 한 개의 불리언으로만 넘긴다.
   */
  active: boolean
  onClose: () => void
}

/** 말풍선 최대 폭(px). 좁은 화면에서는 아래 clamp 가 더 줄인다. */
const BUBBLE_MAX_WIDTH = 280
/** 대상과 말풍선(꼬리 끝) 사이 간격. */
const BUBBLE_GAP = 10
/** 위/아래 뒤집기 판단용 높이 어림값. 실측까지 갈 필요 없이 이 정도면 충분하다. */
const BUBBLE_ESTIMATED_HEIGHT = 120
/** 말풍선이 화면 가장자리에 붙지 않게 남기는 여백. */
const EDGE_MARGIN = 12
/** 대상을 향한 꼬리(정사각형을 45° 돌린 것)의 한 변. 절반이 말풍선 밖으로 나온다. */
const TAIL_SIZE = 12
/** 꼬리가 둥근 모서리를 뚫고 나오지 않도록 말풍선 양 끝에서 비워 두는 폭. */
const TAIL_EDGE_INSET = 16
/**
 * 이 화면들은 몇 초마다 시세가 갱신돼 대상 위치가 스스로 움직인다. scroll·resize 이벤트만으로는
 * 그 변화를 놓치므로 querySelector 1회 + getBoundingClientRect 1회짜리 가벼운 재측정을 이 주기로
 * 돌리되, 값이 실제로 달라졌을 때만 setState 해서 불필요한 리렌더를 막는다.
 */
const MEASURE_INTERVAL_MS = 500

/** 대상의 화면 좌표 + 그때의 뷰포트 크기. 말풍선 clamp 가 뷰포트에 의존하므로 함께 담는다. */
interface Spot {
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

/** 서브픽셀 흔들림으로 리렌더가 반복되지 않게 0.5px 이내 차이는 같은 값으로 본다. */
function sameSpot(a: Spot | null, b: Spot): boolean {
  if (!a) return false
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight
  )
}

/**
 * 안내를 이미 봤는지 기억하는 저장소 접근. 사파리 프라이빗 모드처럼 저장소가 막힌 환경에서는
 * "아직 안 봤다"로 보고 안내를 띄운다 — 못 읽는 것보다 한 번 더 보는 편이 낫다.
 */
export function hasSeenCoachMark(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function markCoachMarkSeen(key: string) {
  try {
    localStorage.setItem(key, 'done')
  } catch {
    // 저장이 막혀도 말풍선은 정상적으로 닫혀야 한다.
  }
}

/** "다시 보기"용. 기록만 지운다 — 다시 띄우는 것은 부모의 상태가 한다. */
export function forgetCoachMark(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 지우지 못해도 부모 상태만으로 이번 세션에는 다시 뜬다.
  }
}

export function CoachMark({ target, title, body, active, onClose }: Props) {
  const [spot, setSpot] = useState<Spot | null>(null)
  const titleId = useId()

  // target 은 부모가 매 렌더 같은 문자열을 넘기지만, ref 로 받아 두면 measure 가 의존성 없이
  // 안정적으로 유지돼 리렌더마다 리스너·타이머를 다시 걸지 않는다.
  const targetRef = useRef(target)
  targetRef.current = target

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-coach="${targetRef.current}"]`)
    if (!el) {
      // 대상이 아직(또는 더 이상) 없으면 조용히 아무것도 그리지 않는다.
      setSpot(null)
      return
    }
    const rect = el.getBoundingClientRect()
    // 크기가 0 이면 숨겨진 요소다. 화면 밖으로 지나간 대상까지 따라가면 말풍선이 뷰포트 밖에
    // 그려져 사라진 것처럼 보이므로, 대상이 실제로 보이는 동안에만 띄운다.
    if (rect.width === 0 && rect.height === 0) {
      setSpot(null)
      return
    }
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
      setSpot(null)
      return
    }
    const next: Spot = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
    setSpot((prev) => (sameSpot(prev, next) ? prev : next))
  }, [])

  useEffect(() => {
    if (!active) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    measure()
    // capture 로 받아야 내부 스크롤 컨테이너의 스크롤도 잡힌다.
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(measure, MEASURE_INTERVAL_MS)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
    }
  }, [active, measure])

  // 뒤 화면을 막지 않으므로 포커스를 빼앗지 않는다 — 대신 Esc 로 언제든 닫을 수 있게 한다.
  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, onClose])

  if (!active || !spot) return null

  const bubbleWidth = Math.min(BUBBLE_MAX_WIDTH, spot.viewportWidth - EDGE_MARGIN * 2)
  const spaceBelow = spot.viewportHeight - (spot.top + spot.height)
  // 아래가 넉넉하면 아래, 아니면 더 넓은 쪽으로 뒤집는다.
  const below = spaceBelow >= BUBBLE_ESTIMATED_HEIGHT + BUBBLE_GAP || spaceBelow >= spot.top
  const targetCenterX = spot.left + spot.width / 2
  const maxLeft = Math.max(EDGE_MARGIN, spot.viewportWidth - bubbleWidth - EDGE_MARGIN)
  const bubbleLeft = Math.min(Math.max(EDGE_MARGIN, targetCenterX - bubbleWidth / 2), maxLeft)
  // 말풍선이 가장자리로 밀려도 꼬리는 대상 가운데를 계속 가리킨다.
  const tailLeft = Math.min(
    Math.max(TAIL_EDGE_INSET, targetCenterX - bubbleLeft - TAIL_SIZE / 2),
    bubbleWidth - TAIL_EDGE_INSET - TAIL_SIZE,
  )

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="fixed z-50 rounded-2xl bg-brand p-4 text-brand-ink shadow-soft"
      style={
        below
          ? { top: spot.top + spot.height + BUBBLE_GAP, left: bubbleLeft, width: bubbleWidth }
          : {
              bottom: spot.viewportHeight - spot.top + BUBBLE_GAP,
              left: bubbleLeft,
              width: bubbleWidth,
            }
      }
    >
      <span
        aria-hidden="true"
        className="absolute h-3 w-3 rotate-45 bg-brand"
        style={below ? { top: -TAIL_SIZE / 2, left: tailLeft } : { bottom: -TAIL_SIZE / 2, left: tailLeft }}
      />
      <p id={titleId} className="pr-7 text-sm font-semibold">
        {title}
      </p>
      <p className="mt-1.5 pr-1 text-[13px] leading-relaxed text-brand-ink/75">{body}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="안내 닫기"
        className="absolute right-2 top-2 rounded-full p-1.5 text-brand-ink/70 transition-colors duration-300 hover:bg-brand-ink/10 hover:text-brand-ink"
      >
        <Close width={16} height={16} />
      </button>
    </div>
  )
}
