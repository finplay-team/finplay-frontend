// 시장가와 지정가가 무엇인지 초보자에게 설명하는 모달과 그것을 여는 작은 버튼
import { useEffect, useId, useRef } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/**
 * 이 설명을 자동으로 한 번 띄웠는지 기억하는 키. 스포트라이트 안내(`finplay.tour.*`)와 구분되는
 * 이름을 쓴다 — 안내를 다시 보기로 지울 때 이 키까지 함께 지워지면 안 되기 때문이다.
 */
export const ORDER_TYPE_GUIDE_KEY = 'finplay.guide.orderType'

export function hasSeenOrderTypeGuide(): boolean {
  try {
    return localStorage.getItem(ORDER_TYPE_GUIDE_KEY) !== null
  } catch {
    // 저장소가 막힌 환경(사파리 프라이빗 모드 등)에서는 "아직 못 봤다"로 보고 한 번 띄운다.
    return false
  }
}

export function markOrderTypeGuideSeen() {
  try {
    localStorage.setItem(ORDER_TYPE_GUIDE_KEY, 'done')
  } catch {
    // 저장이 막혀도 모달은 정상적으로 닫혀야 한다.
  }
}

/** 어디에 두든 같은 문구로 열리게 하려고 여는 버튼도 여기서 함께 내보낸다. */
export function OrderTypeGuideButton({
  onClick,
  className = '',
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-line bg-elevated px-3 py-1.5 text-xs text-muted transition-colors duration-300 hover:text-ink ${className}`}
    >
      시장가·지정가가 뭔가요?
    </button>
  )
}

/**
 * 설명 모달. 오버레이·카드·z-[60]는 ConfirmDialog와 같은 규칙을 따른다 —
 * 스포트라이트 안내(z-50)와 겹칠 수 있어 이 모달이 위로 올라와야 한다.
 */
export function OrderTypeGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  /**
   * 포커스는 닫기 버튼이 아니라 모달 자체에 준다. 아래쪽 버튼에 autoFocus 를 걸면 브라우저가
   * 그 버튼을 보이게 하려고 오버레이를 끝까지 스크롤해서, 화면이 작을 때 제목부터 잘려 나간다(실측).
   */
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus({ preventScroll: true })
  }, [open])

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      // 내용이 화면보다 길 수 있다. 오버레이에 flex 와 overflow 를 함께 주면 넘친 위쪽이 잘려
      // 제목이 보이지 않으므로, 스크롤 컨테이너와 가운데 정렬 래퍼를 분리한다.
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="w-full max-w-lg" innerClassName="p-6">
          <p id={titleId} className="text-base font-semibold text-ink">
            시장가와 지정가, 뭐가 다른가요?
          </p>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-line bg-elevated/60 p-4">
              <p className="text-sm font-medium text-ink">시장가 · 지금 값에 바로 사고팔기</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                지금 화면에 보이는 값으로 바로 사고파는 방법입니다. 누르면 거의 반드시 처리됩니다. 다만 값이
                계속 움직이고 있어서, 실제로 처리된 값은 눌렀을 때 보이던 값과 조금 다를 수 있어요.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-elevated/60 p-4">
              <p className="text-sm font-medium text-ink">지정가 · 원하는 값을 정해 두고 기다리기</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                "이 값이 되면 사 줘(팔아 줘)"라고 미리 예약해 두는 방법입니다. 원하는 값에 처리되는 대신, 값이
                거기까지 오지 않으면 끝내 처리되지 않을 수 있어요.
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-line bg-elevated/60 p-4">
            <p className="text-sm font-medium text-ink">예를 들면</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              지금 값이 10,000원인데 9,500원에 지정가 구매를 걸어 두면, 값이 9,500원까지 내려와야 사집니다.
              9,600원까지만 내려왔다가 다시 올라가면 사지 못한 채로 남습니다.
            </p>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <p>
              <span className="font-medium text-ink">예약해 둔 주문은 어디에 있나요.</span> 지정가로 걸어 둔
              주문은 "미체결(예약 대기)"로 남아 있습니다. 값을 고치거나 취소할 수 있고, 기다리지 않고 지금 값에
              바로 처리할 수도 있어요.
            </p>
            <p>
              <span className="font-medium text-ink">지금 이 서비스에서는.</span> 지정가는 코인에서만 쓸 수
              있습니다. 주식은 시장가로만 사고팔 수 있어요.
            </p>
            <p>
              <span className="font-medium text-ink">한 줄로 정리하면.</span> 빨리 확실하게 하고 싶으면 시장가,
              값을 꼭 지키고 싶으면 지정가입니다.
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="button" size="sm" onClick={onClose}>
              알겠어요
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
