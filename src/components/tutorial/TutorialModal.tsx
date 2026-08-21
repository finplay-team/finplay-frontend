// 튜토리얼 안의 모달 세 종류(되돌아보기·단계 안내·자동 매도 결과)가 공유하는 틀
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Card } from '../ui/Card'
import { Close } from '../ui/icons'

/**
 * 완료 축하 모달(`CompletionCelebration`)과도 같은 틀이다 — 어두운 배경·중앙 카드·ESC·바깥 클릭·X로
 * 닫기. 예전에는 `AttemptTutorialFlow.tsx` 안에 있었는데, 자동 매도 결과 모달이 같은 틀을 쓰게 되면서
 * 파일 밖으로 꺼냈다(그대로 두면 두 파일이 서로를 import 하는 순환이 된다).
 */
export function TutorialModal({
  eyebrow,
  title,
  onClose,
  maxWidthClassName = 'max-w-lg',
  children,
}: {
  eyebrow: string
  title: string
  onClose: () => void
  maxWidthClassName?: string
  children: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      // CompletionCelebration(z-[70])보다는 아래, ConfirmDialog(z-[60])·SpotlightTour(z-50)보다는 위다 —
      // 셋 다 동시에 열릴 일은 없지만(완료 순간엔 다른 모달을 안 연다), 순서는 맞춰 둔다.
      className="fixed inset-0 z-[65] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
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
        className={`w-full outline-none ${maxWidthClassName}`}
      >
        <Card innerClassName="p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium tracking-eyebrow text-muted">{eyebrow}</p>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="-mr-1 -mt-1 rounded-full p-2 text-muted transition hover:bg-white/[0.06] hover:text-ink"
            >
              <Close width={16} height={16} />
            </button>
          </div>
          <h2 id={titleId} className="mt-3 text-lg font-semibold leading-snug text-ink">
            {title}
          </h2>
          <div className="mt-4">{children}</div>
        </Card>
      </div>
    </div>
  )
}
