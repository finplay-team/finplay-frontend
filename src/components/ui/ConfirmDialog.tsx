// 파괴적 동작 전 확인을 받는 인앱 모달 — 브라우저 네이티브 confirm()은 일부 임베디드/자동화 환경에서 항상 취소로 처리돼 신뢰할 수 없다
import { useEffect, useId } from 'react'
import { Button } from './Button'
import { Card } from './Card'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 기본은 강조(primary). 삭제처럼 두 선택지를 동등하게 두고 싶으면 취소와 같은 ghost로 맞춘다. */
  confirmVariant?: 'primary' | 'ghost' | 'soft'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null
  // 확인 다이얼로그는 앱에서 가장 위다. 튜토리얼 스포트라이트 안내(z-50)와 겹칠 수 있는데, DOM 순서에
  // 기대면 마운트 위치가 바뀌는 순간 조용히 뒤집히므로 z를 명시적으로 올려 둔다.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <Card className="w-full max-w-sm" innerClassName="p-6">
        <p id={titleId} className="text-base font-semibold text-ink">{title}</p>
        <p id={messageId} className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          {/* 취소 쪽에 초기 포커스를 둔다 — 파괴적 동작이라 실수로 Enter를 눌렀을 때의 기본값은 안전한 쪽이어야 한다 */}
          <Button type="button" variant="ghost" size="sm" autoFocus disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} size="sm" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}
