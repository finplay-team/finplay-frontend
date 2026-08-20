// 튜토리얼 완료 결과 모달 — 최초 완료 순간에는 축하와 함께, 이후에는 결과만 다시 보여준다
import { useEffect, useId, useRef, useState } from 'react'
import { Button, LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { Close } from '../ui/icons'
import { EntryComparison } from './EntryComparison'
import { ScenarioEventSummary } from './ScenarioEventPanel'
import { formatKRW } from '../../lib/format'
import type {
  PracticeEntryResponse,
  PracticeScenarioEventResponse,
} from '../../services/tutorialTypes'
import type { Market } from '../../services/types'

/**
 * 금액이 0에서 목표값까지 올라가는 시간. 이 화면은 5분 제한 타이머가 도는 자리와 같아서
 * 한 번 크게 보이고 빨리 끝나야 한다 — 늘리지 않는다.
 */
const COUNT_UP_MS = 1000

const MARKET_LABEL: Record<Market, string> = { STOCK: '주식', CRYPTO: '코인' }

/**
 * 완료 문구는 이 모달과 완료(replay) 카드 두 곳에서 쓰인다. 같은 완료를 두 문구로 말하면 사용자가
 * 다른 일로 읽으므로, 시장별 문자열은 아래 두 함수에서만 만들고 양쪽이 그것을 가져다 쓴다.
 */
export function completionTitle(market: Market): string {
  return `${MARKET_LABEL[market]} 시장의 실습을 완료했습니다`
}

/**
 * 보상 문장을 금액 앞/뒤로 나눠 준다 — 모달은 금액을 세어 올리느라 span으로 감싸야 해서 통문자열을
 * 쓸 수 없다. 문장을 바꿀 때는 여기만 고치면 카드와 모달이 함께 바뀐다.
 */
export function rewardSentenceParts(market: Market): { before: string; after: string } {
  return { before: `${MARKET_LABEL[market]}용 자금 `, after: '이 계좌에 들어왔습니다.' }
}

/**
 * 애니메이션을 줄여야 하는지. matchMedia가 없는 환경(jsdom 등)은 줄이는 쪽으로 본다 —
 * 연출을 못 하는 것보다 최종 금액을 곧바로 보여주는 쪽이 안전하다.
 */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function CompletionCelebration({
  open,
  market,
  rewardAmount,
  entries = [],
  revealedEvents = [],
  celebrate = true,
  onClose,
}: {
  open: boolean
  market: Market
  /** 서버가 이번에 지급한 금액. null이면 금액 문장 자체를 쓰지 않는다 — 없는 금액을 지어내지 않는다. */
  rewardAmount: number | null
  /** 진입별 대조. 비어 있으면(대본 이전 실행·legacy) 결과 영역 없이 축하만 뜬다. */
  entries?: PracticeEntryResponse[]
  revealedEvents?: PracticeScenarioEventResponse[]
  /**
   * 지금이 **최초 완료 순간**인가. 축하 문구와 금액 세어 올리기는 그때만 한다 — 되돌아보기 탭의
   * "결과 다시 보기"로 다시 연 화면에서 매번 축하하면 어색해진다(완료 카드와 같은 판단).
   */
  celebrate?: boolean
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [reduced] = useState(prefersReducedMotion)
  const [amount, setAmount] = useState(rewardAmount ?? 0)
  const [entered, setEntered] = useState(false)

  // 숫자 세어 올리기. 언마운트·닫힘에는 프레임을 취소한다.
  useEffect(() => {
    if (!open || rewardAmount === null) return
    if (reduced || !celebrate) {
      setAmount(rewardAmount)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - start) / COUNT_UP_MS)
      // 끝으로 갈수록 느려지게 — 마지막 숫자가 눈에 남는다. ratio가 1이면 정확히 목표값이 된다.
      setAmount(rewardAmount * (1 - (1 - ratio) ** 3))
      if (ratio < 1) frame = requestAnimationFrame(tick)
    }
    setAmount(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [celebrate, open, reduced, rewardAmount])

  // 등장 모션. 애니메이션 축소 선호면 처음부터 최종 상태로 그린다.
  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    if (reduced) {
      setEntered(true)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [open, reduced])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 열릴 때 포커스를 모달로 옮기고 닫히면 원래 있던 곳으로 돌려준다.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [open])

  if (!open) return null

  const reward = rewardSentenceParts(market)
  const accentText = market === 'CRYPTO' ? 'text-coin' : 'text-brand'
  const motion = reduced ? '' : 'transition-all duration-400 ease-spring'
  /**
   * 진입 카드가 있으면 전체 폭으로 펼친다 — 재진입한 사용자는 카드가 두 장이라 좁은 폭에서는 나란히
   * 놓이지 않는다. 카드가 없는 legacy 완료는 예전처럼 작은 모달로 둔다.
   */
  const wide = entries.length > 0

  return (
    <div
      // ConfirmDialog(z-[60])·SpotlightTour(z-50)보다 위다. 근거는 보고 참고.
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full outline-none ${wide ? 'max-w-3xl' : 'max-w-md'} ${motion} ${entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium tracking-eyebrow text-muted">실습 완료</p>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="-mr-1 -mt-1 rounded-full p-2 text-muted transition hover:bg-white/[0.06] hover:text-ink"
            >
              <Close width={16} height={16} />
            </button>
          </div>
          <h2 id={titleId} className="mt-3 text-xl font-semibold leading-snug text-ink">
            {completionTitle(market)}
          </h2>
          {rewardAmount !== null && (
            <p className="mt-4 text-sm leading-relaxed text-ink">
              {/* "축하합니다"는 지금 이 순간에만 어울린다 — 다시 열어 보는 화면에는 넣지 않는다. */}
              {celebrate && '축하합니다. '}
              {reward.before}
              <span className={`tabular text-xl font-semibold ${accentText}`}>{formatKRW(amount)}</span>
              {reward.after}
            </p>
          )}

          {wide && (
            <div className="mt-5">
              <EntryComparison entries={entries} layout="wide" />
            </div>
          )}
          {wide && revealedEvents.length > 0 && (
            <div className="mt-5">
              <ScenarioEventSummary events={revealedEvents} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <LinkButton to="/trade" withIcon>
              실전 거래 시작하기
            </LinkButton>
            <Button type="button" variant="ghost" onClick={onClose}>
              {/* 결과를 이미 이 안에서 보여주므로 "완료 기록 보기"라고 부르지 않는다. */}
              닫기
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
