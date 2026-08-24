// 게임 튜토리얼처럼 화면을 어둡게 덮고 지금 눌러야 할 요소 하나만 밝게 드러내 말풍선으로 설명하는 안내 오버레이
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'

export interface SpotlightStep {
  /** 대상 요소의 data-tour 속성값. 예: 'instrument' → [data-tour="instrument"] */
  target: string
  title: string
  body: string
}

interface Props {
  steps: SpotlightStep[]
  /** 이 안내를 이미 봤는지 기억하는 localStorage 키 */
  storageKey: string
  /** false면 아무것도 렌더하지 않는다 */
  active: boolean
}

/** 대상의 화면 좌표 + 그때의 뷰포트 크기. 말풍선 clamp가 뷰포트에 의존하므로 함께 담는다. */
interface Spot {
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

/** 구멍을 대상보다 살짝 넓게 뚫어야 대상 테두리가 어둠에 먹히지 않는다. */
const HOLE_PADDING = 8
/** 말풍선 최대 폭(px). 375px 화면에서는 아래 clamp가 더 좁게 줄인다. */
const BUBBLE_MAX_WIDTH = 300
/** 구멍과 말풍선 사이 간격. */
const BUBBLE_GAP = 12
/** 위/아래 뒤집기 판단용 말풍선 높이 어림값. 실측까지 갈 필요 없이 이 정도면 충분하다. */
const BUBBLE_ESTIMATED_HEIGHT = 160
/** 말풍선이 화면 가장자리에 붙지 않게 남기는 여백. */
const EDGE_MARGIN = 12
/**
 * 3초마다 가격이 갱신되는 화면이라 scroll·resize 이벤트만으로는 대상 위치 변화를 놓친다.
 * querySelector 1회 + getBoundingClientRect 1회짜리 가벼운 재측정을 이 주기로 돌리되,
 * 값이 실제로 달라졌을 때만 setState 해서 불필요한 리렌더를 막는다.
 */
const MEASURE_INTERVAL_MS = 500
/**
 * 다음 단계로 넘어간 직후, 그 단계의 대상이 나타나길 기다려 주는 시간.
 * 종목 선택처럼 서버 왕복 뒤에야 다음 카드가 마운트되는 구간이 있어서, 이 시간 안에는
 * 뒤 단계 대상이 먼저 눈에 띄어도 건너뛰지 않는다. API 왕복을 덮을 만큼 잡는다.
 */
const STEP_ENTRY_GRACE_MS = 1000

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    // 사파리 프라이빗 모드처럼 저장소가 막힌 환경에서는 "아직 안 봤다"로 보고 안내를 띄운다.
    return false
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, 'done')
  } catch {
    // 저장이 막혀도 안내는 정상적으로 닫혀야 한다.
  }
}

function queryTarget(step: SpotlightStep) {
  return document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
}

function findTarget(steps: SpotlightStep[], fromIndex: number) {
  for (let i = fromIndex; i < steps.length; i += 1) {
    const el = queryTarget(steps[i])
    if (el) return { index: i, el }
  }
  return null
}

/**
 * "이전"이 부르는 뒤쪽 탐색. 앞쪽 탐색(`findTarget`)과 방향만 반대가 아니다 — 대상이 없으면
 * **더 이전 단계**로 계속 내려가 찾는다. 종목을 고르고 나면 그 목록 자체가 사라지므로(`instrument`
 * 단계), 앞쪽 탐색과 같은 방식으로 이 방향에서도 없는 대상을 건너뛰지 않으면 "이전"이 조용히
 * 아무 일도 하지 않는 것처럼 보인다.
 */
function findTargetBackward(steps: SpotlightStep[], fromIndex: number) {
  for (let i = fromIndex; i >= 0; i -= 1) {
    const el = queryTarget(steps[i])
    if (el) return { index: i, el }
  }
  return null
}

function readSpot(el: HTMLElement): Spot {
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
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

export function SpotlightTour({ steps, storageKey, active }: Props) {
  const [dismissed, setDismissed] = useState(() => hasSeen(storageKey))
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [reduced, setReduced] = useState(false)

  // steps·storageKey는 부모가 매 렌더 새 참조로 넘길 수 있다. ref로 받아 두면 아래 콜백들이
  // 의존성 없이 안정적으로 유지돼 리렌더마다 리스너를 재등록하지 않는다.
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey
  const indexRef = useRef(0)
  const bubbleRef = useRef<HTMLDivElement>(null)
  /**
   * 이번 단계의 대상을 한 번이라도 찾았는지. 찾은 뒤에는 그 단계에 머무른다 —
   * 단계별 카드가 나타났다 접히는 화면에서 대상이 잠깐 사라졌다고 뒤 단계로 건너뛰면 안 된다.
   * 건너뛰기는 단계에 처음 들어설 때만 일어난다.
   */
  const lockedRef = useRef(false)
  /** 이 시각 전까지는 단계 전환 직후의 유예 구간이라 건너뛰기를 미룬다. */
  const graceUntilRef = useRef(0)

  const enabled = active && !dismissed

  const applySpot = useCallback((el: HTMLElement) => {
    setTarget((prev) => (prev === el ? prev : el))
    const next = readSpot(el)
    setSpot((prev) => (sameSpot(prev, next) ? prev : next))
  }, [])

  const clearSpot = useCallback(() => {
    setTarget(null)
    setSpot(null)
  }, [])

  const sync = useCallback(() => {
    const steps = stepsRef.current
    const current = steps[indexRef.current]
    if (!current) {
      clearSpot()
      return
    }

    // 이미 이번 단계 대상을 잡았거나, 방금 이 단계로 넘어와 유예 중이면 현재 대상만 본다.
    // 어느 쪽이든 뒤 단계로 건너뛰지 않고, 대상이 없으면 다시 나타날 때까지 오버레이만 감춘다.
    if (lockedRef.current || Date.now() < graceUntilRef.current) {
      const el = queryTarget(current)
      if (!el) {
        clearSpot()
        return
      }
      lockedRef.current = true
      applySpot(el)
      return
    }

    const found = findTarget(steps, indexRef.current)
    if (!found) {
      clearSpot()
      return
    }
    if (found.index !== indexRef.current) {
      indexRef.current = found.index
      setIndex(found.index)
    }
    lockedRef.current = true
    applySpot(found.el)
  }, [applySpot, clearSpot])

  const finish = useCallback(() => {
    markSeen(storageKeyRef.current)
    setDismissed(true)
  }, [])

  const goNext = useCallback(() => {
    const next = indexRef.current + 1
    if (next >= stepsRef.current.length) {
      finish()
      return
    }
    indexRef.current = next
    // 새 단계에 들어설 때만 "대상 없으면 건너뛰기"를 다시 허용하되,
    // 서버 응답을 기다려 카드가 늦게 뜨는 구간을 위해 유예를 준다.
    lockedRef.current = false
    graceUntilRef.current = Date.now() + STEP_ENTRY_GRACE_MS
    setIndex(next)
  }, [finish])

  /**
   * 이전 단계로 돌아간다. `sync()`(=`findTarget`)에 맡기면 앞쪽으로만 훑어서, 방금 왔던 단계의
   * 대상이 이미 사라졌을 때(예: 종목을 고른 뒤의 `instrument` 단계) 제자리로 되튕겨 "이전"이 아무
   * 일도 안 하는 것처럼 보인다. 그래서 여기서 직접 뒤쪽으로 찾고, 찾은 대상을 곧바로 확정한다.
   */
  const goPrev = useCallback(() => {
    const found = findTargetBackward(stepsRef.current, indexRef.current - 1)
    if (!found) return
    indexRef.current = found.index
    lockedRef.current = true
    graceUntilRef.current = 0
    setIndex(found.index)
    applySpot(found.el)
  }, [applySpot])

  // 애니메이션 축소 선호 감지. jsdom 등 matchMedia가 없는 환경도 있으므로 존재를 확인한다.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  // 위치 추적: 최초 1회 + scroll/resize(rAF로 프레임당 1회) + 주기 재측정.
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        sync()
      })
    }

    sync()
    // capture로 받아야 내부 스크롤 컨테이너의 스크롤도 잡힌다.
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(sync, MEASURE_INTERVAL_MS)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
    }
  }, [enabled, sync])

  // 단계가 바뀌면 곧바로 새 대상을 찾는다 (대상이 없는 단계는 sync가 건너뛴다).
  useEffect(() => {
    if (!enabled) return
    sync()
  }, [enabled, index, sync])

  // 대상 자체의 크기 변화 추적. jsdom에는 ResizeObserver가 없다.
  useEffect(() => {
    if (!enabled || !target || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => sync())
    observer.observe(target)
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [enabled, target, sync])

  // 대상 클릭이 곧 다음 단계다. 오버레이가 아니라 대상 요소에 직접 붙여 클릭을 가로채지 않는다.
  useEffect(() => {
    if (!enabled || !target) return
    target.addEventListener('click', goNext)
    return () => target.removeEventListener('click', goNext)
  }, [enabled, target, goNext])

  // 대상이 화면 밖이면 보이게 스크롤한다. jsdom에는 scrollIntoView가 없다.
  useEffect(() => {
    if (!enabled || !target || typeof target.scrollIntoView !== 'function') return
    const rect = target.getBoundingClientRect()
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return
    target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [enabled, target, reduced])

  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, finish])

  // 단계가 바뀔 때만 말풍선으로 포커스를 옮긴다. 포커스 트랩은 만들지 않아 대상 클릭을 막지 않는다.
  useEffect(() => {
    if (!enabled || !target) return
    bubbleRef.current?.focus({ preventScroll: true })
  }, [enabled, target])

  const step = steps[index]
  if (!enabled || !spot || !step) return null

  const holeTop = spot.top - HOLE_PADDING
  const holeLeft = spot.left - HOLE_PADDING
  const holeWidth = spot.width + HOLE_PADDING * 2
  const holeHeight = spot.height + HOLE_PADDING * 2

  const bubbleWidth = Math.min(BUBBLE_MAX_WIDTH, spot.viewportWidth - EDGE_MARGIN * 2)
  const spaceBelow = spot.viewportHeight - (holeTop + holeHeight)
  // 아래가 넉넉하면 아래, 아니면 더 넓은 쪽으로 뒤집는다.
  const below = spaceBelow >= BUBBLE_ESTIMATED_HEIGHT + BUBBLE_GAP || spaceBelow >= holeTop
  const desiredLeft = holeLeft + holeWidth / 2 - bubbleWidth / 2
  const maxLeft = Math.max(EDGE_MARGIN, spot.viewportWidth - bubbleWidth - EDGE_MARGIN)
  const bubbleLeft = Math.min(Math.max(EDGE_MARGIN, desiredLeft), maxLeft)

  const isLast = index === steps.length - 1
  // 대상이 이미 사라진 단계로는 되돌아갈 수 없으므로, 갈 곳이 실제로 있을 때만 "이전"을 보여준다.
  const canGoPrev = findTargetBackward(steps, index - 1) !== null
  const motion = reduced ? '' : 'transition-[top,left,width,height] duration-200 ease-spring'

  return (
    <div
      role="dialog"
      aria-label="화면 사용법 안내"
      // 오버레이 전체는 클릭을 통과시킨다 — 스포트라이트가 가리킨 대상을 실제로 눌러야 하기 때문이다.
      className="pointer-events-none fixed inset-0 z-50"
    >
      {/*
        구멍 뚫린 어둠: 대상 크기의 빈 박스에 뷰포트를 덮고도 남는 box-shadow 확산을 준다.
        박스 자신이 pointer-events-none 이라 그림자도 클릭을 가로채지 않는다.
      */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed rounded-2xl ring-2 ring-brand/70 ${motion}`}
        style={{
          top: holeTop,
          left: holeLeft,
          width: holeWidth,
          height: holeHeight,
          boxShadow: '0 0 0 9999px rgba(10, 10, 11, 0.78)',
        }}
      />

      <div
        ref={bubbleRef}
        tabIndex={-1}
        className={`pointer-events-auto fixed rounded-core border border-line bg-surface p-4 shadow-soft outline-none ${motion}`}
        style={
          below
            ? { top: holeTop + holeHeight + BUBBLE_GAP, left: bubbleLeft, width: bubbleWidth }
            : {
                bottom: spot.viewportHeight - holeTop + BUBBLE_GAP,
                left: bubbleLeft,
                width: bubbleWidth,
              }
        }
      >
        <p className="text-[11px] font-medium tracking-eyebrow text-muted">
          {index + 1} / {steps.length}
        </p>
        <p className="mt-1.5 text-sm font-semibold text-ink">{step.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            안내 끄기
          </Button>
          <div className="flex items-center gap-2">
            {canGoPrev && (
              <Button type="button" variant="ghost" size="sm" onClick={goPrev}>
                이전
              </Button>
            )}
            <Button type="button" variant="primary" size="sm" onClick={goNext}>
              {isLast ? '안내 마치기' : '다음'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
