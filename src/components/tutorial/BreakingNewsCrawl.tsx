// 새 사건이 공개되는 순간에만 화면 왼쪽에서 나와 오른쪽으로 흘러가는 속보 자막
import { useEffect, useRef, useState } from 'react'
import type { PracticeScenarioEventResponse } from '../../services/tutorialTypes'
import type { Market } from '../../services/types'

/** 자막이 흐르는 속도. 문장 길이와 무관하게 체감 속도가 일정하도록 픽셀/초로 고정한다. */
const CRAWL_PX_PER_SEC = 210
/** 아주 짧은 문장이 눈 깜짝할 새 지나가지 않도록 잡아 두는 최소 시간. */
const MIN_DURATION_MS = 1800
/** 애니메이션을 줄여야 할 때 대신 고정해서 보여주는 시간. */
const REDUCED_MOTION_HOLD_MS = 3200

/**
 * 애니메이션을 줄여야 하는지. matchMedia가 없는 환경(jsdom 등)은 줄이는 쪽으로 본다 —
 * CompletionCelebration.tsx와 같은 판단이다.
 */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * `revealedEvents`가 늘어날 때만(3초 tick마다가 아니라) 가장 최근 사건 하나를 흘려보낸다.
 * 여러 개가 한꺼번에 늘어도(초기 로드 등) 마지막 하나만 보여준다 — 큐를 쌓지 않는다.
 */
export function BreakingNewsCrawl({
  market,
  events,
}: {
  market: Market
  events: PracticeScenarioEventResponse[]
}) {
  const [active, setActive] = useState<PracticeScenarioEventResponse | null>(null)
  const seenCountRef = useRef(events.length)
  const trackRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLSpanElement>(null)
  const animationRef = useRef<Animation | null>(null)

  useEffect(() => {
    const added = events.length - seenCountRef.current
    seenCountRef.current = events.length
    if (added <= 0) return
    setActive(events[events.length - 1])
  }, [events])

  useEffect(() => {
    if (!active) return
    if (animationRef.current) animationRef.current.cancel()

    if (prefersReducedMotion()) {
      const timer = setTimeout(() => setActive(null), REDUCED_MOTION_HOLD_MS)
      return () => clearTimeout(timer)
    }

    // 실제 폭을 재야 문장 길이와 무관하게 화면을 완전히 가로지른다 — 레이아웃이 잡힌 다음 프레임에서 잰다.
    const frame = requestAnimationFrame(() => {
      const track = trackRef.current
      const item = itemRef.current
      if (!track || !item) return
      const trackWidth = track.clientWidth
      const textWidth = item.getBoundingClientRect().width
      const distance = trackWidth + textWidth
      const duration = Math.max(MIN_DURATION_MS, (distance / CRAWL_PX_PER_SEC) * 1000)

      const animation = item.animate(
        [
          { transform: `translate(-${textWidth}px, -50%)` },
          { transform: `translate(${trackWidth}px, -50%)` },
        ],
        { duration, easing: 'linear', fill: 'forwards' },
      )
      animationRef.current = animation
      animation.onfinish = () => setActive(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  const accentBadge = market === 'CRYPTO' ? 'bg-coin text-coin-ink' : 'bg-brand text-brand-ink'
  const accentDot = market === 'CRYPTO' ? 'bg-coin-ink' : 'bg-brand-ink'
  const accentGradient =
    market === 'CRYPTO'
      ? 'from-coin/12 to-transparent border-coin/35'
      : 'from-brand/12 to-transparent border-brand/35'

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-gradient-to-r transition-[height,margin] duration-300 ease-spring ${
        active ? `mb-4 h-11 ${accentGradient}` : 'h-0 border-transparent'
      }`}
    >
      {active && (
        <div className="relative flex h-11 items-center">
          <span
            className={`absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${accentBadge}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 flex-none rounded-full ${accentDot} animate-pulse-soft`} />
            속보
          </span>
          {/* 배지 폭(약 88px)만큼 트랙을 비워 자막이 배지 밑을 지나가지 않게 한다. */}
          <div ref={trackRef} aria-live="polite" className="absolute inset-y-0 left-[88px] right-0 overflow-hidden">
            <span
              ref={itemRef}
              className="absolute top-1/2 whitespace-nowrap text-sm text-ink"
              style={{ transform: 'translate(-9999px, -50%)' }}
            >
              {active.headline}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
