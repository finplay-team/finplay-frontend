// 주문 수량을 주문가능 현금·보유수량의 비율로 한 번에 채워 주는 프리셋 버튼 묶음
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { presetQuantity } from '../../lib/quantity'
import type { OrderSide } from '../../services/types'

/** 마지막 1 은 매수면 "최대", 매도면 "전량"이다. */
const RATIOS = [0.1, 0.25, 0.5, 0.75, 1] as const

interface Props {
  side: OrderSide
  isCrypto: boolean
  /** 예약분을 뺀 주문가능 현금 */
  availableCash: number | null
  /** 예약분을 뺀 매도가능 수량 */
  held: number
  /** 비율 계산의 기준 가격 — 시장가는 현재가, 지정가는 입력한 지정가다. */
  unitPrice: number | null
  /** 지금 누를 수 없는 이유. null 이면 누를 수 있다. */
  disabledReason: string | null
  onPick: (quantity: number) => void
}

/** 코치마크(자동 스팟라이트) 대신 필요할 때만 눌러서 보는 설명 — 항상 같은 자리에 있어 다시 찾기 쉽다. */
const HELP_TEXT =
  '가진 돈(팔 때는 가진 수량)의 10%·25%·50%·75%·최대를 누르면 수량이 알아서 채워져요. 직접 계산하지 않아도 돼요.'

export function QuantityPresets({
  side,
  isCrypto,
  availableCash,
  held,
  unitPrice,
  disabledReason,
  onPick,
}: Props) {
  const quantities = useMemo(
    () =>
      RATIOS.map((ratio) =>
        presetQuantity({ side, isCrypto, ratio, availableCash, held, unitPrice }),
      ),
    [availableCash, held, isCrypto, side, unitPrice],
  )

  // 가장 큰 비율로도 0 이면 어느 버튼을 눌러도 채울 수량이 없다.
  const nothingToFill = disabledReason === null && quantities[quantities.length - 1] <= 0
  const message =
    disabledReason ??
    (nothingToFill
      ? side === 'BUY'
        ? '가진 돈이 적어서 지금 가격으로는 살 수 있는 수량이 없어요.'
        : '팔 수 있는 수량이 없어요.'
      : null)

  const [helpOpen, setHelpOpen] = useState(false)
  const helpId = useId()
  const helpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!helpOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      if (!helpRef.current?.contains(e.target as Node)) setHelpOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [helpOpen])

  return (
    <div className="mt-2">
      <div
        role="group"
        aria-label={side === 'BUY' ? '가진 돈의 비율로 수량 채우기' : '가진 수량의 비율로 수량 채우기'}
        className="flex flex-wrap items-center gap-1.5"
      >
        <span className="text-[11px] text-muted">{side === 'BUY' ? '가진 돈의' : '가진 수량의'}</span>
        {RATIOS.map((ratio, i) => (
          <button
            key={ratio}
            type="button"
            disabled={disabledReason !== null || quantities[i] <= 0}
            onClick={() => onPick(quantities[i])}
            className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-muted"
          >
            {ratio < 1 ? `${ratio * 100}%` : side === 'BUY' ? '최대' : '전량'}
          </button>
        ))}
        <div ref={helpRef} className="relative ml-auto">
          <button
            type="button"
            aria-label="이 버튼들 설명 보기"
            aria-expanded={helpOpen}
            aria-describedby={helpOpen ? helpId : undefined}
            onClick={() => setHelpOpen((v) => !v)}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
          >
            ?
          </button>
          {helpOpen && (
            <div
              id={helpId}
              role="tooltip"
              className="absolute right-0 top-[calc(100%+6px)] z-10 w-64 rounded-2xl border border-line bg-elevated p-3 text-[12px] leading-relaxed text-muted shadow-soft-sm"
            >
              {HELP_TEXT}
            </div>
          )}
        </div>
      </div>
      {message && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{message}</p>}
    </div>
  )
}
