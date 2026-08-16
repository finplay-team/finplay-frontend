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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
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
          <Button type="button" variant="primary" size="sm" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  )
}
