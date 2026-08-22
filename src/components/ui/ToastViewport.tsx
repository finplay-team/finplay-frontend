// 화면 상단 중앙에 토스트 알림을 쌓아 보여주는 전역 뷰포트 (App 루트에 한 번만 마운트한다)
import { useEffect, useState, useSyncExternalStore } from 'react'
import { dismissToast, getToasts, subscribeToasts, type Toast, type ToastTone } from '../../lib/toastBus'
import { Check, Close, Warning } from './icons'

/**
 * 애니메이션을 줄여야 하는지. matchMedia가 없는 환경(jsdom 등)은 줄이는 쪽으로 본다 —
 * BreakingNewsCrawl·CompletionCelebration 과 같은 판정이다.
 */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 톤별 테두리·아이콘 색. 새 색을 만들지 않고 기존 토큰(brand/gain/line)만 쓴다. */
const TONE_STYLE: Record<ToastTone, { border: string; icon: string }> = {
  success: { border: 'border-brand/40', icon: 'text-brand' },
  warning: { border: 'border-gain/50', icon: 'text-gain' },
  neutral: { border: 'border-line', icon: 'text-muted' },
}

function ToastCard({ toast, reduced }: { toast: Toast; reduced: boolean }) {
  // 줄임 설정이면 처음부터 보이는 상태로 둬서 전환 자체를 없앤다.
  const [shown, setShown] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  const tone = TONE_STYLE[toast.tone]
  const motion = reduced
    ? ''
    : `transition duration-200 ease-spring ${shown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`

  return (
    <div
      role="status"
      // 경고만 진행 중인 낭독을 끊는다. 나머지는 하던 말이 끝난 뒤에 읽히면 충분하다.
      aria-live={toast.tone === 'warning' ? 'assertive' : 'polite'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-core border ${tone.border} bg-surface p-4 shadow-soft ${motion}`}
    >
      {toast.tone === 'success' && (
        <Check aria-hidden="true" className={`mt-0.5 shrink-0 ${tone.icon}`} width={18} height={18} />
      )}
      {toast.tone === 'warning' && (
        <Warning aria-hidden="true" className={`mt-0.5 shrink-0 ${tone.icon}`} width={18} height={18} />
      )}
      <p className="flex-1 text-sm leading-relaxed text-ink">{toast.text}</p>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={() => dismissToast(toast.id)}
        className="-m-1 shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-ink"
      >
        <Close aria-hidden="true" width={16} height={16} />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  const [reduced] = useState(prefersReducedMotion)

  if (toasts.length === 0) return null

  return (
    // Nav(z-40) 위, SpotlightTour(z-50) 아래. top 값은 Nav 높이를 피하려고 Trade.tsx 의
    // pt-20 md:pt-24 와 같은 값을 쓴다. 컨테이너는 클릭을 통과시키고 카드만 받는다.
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[45] flex flex-col items-center gap-2 px-4 md:top-24">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} reduced={reduced} />
      ))}
    </div>
  )
}
