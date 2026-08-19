// 라벨 옆에 붙는 물음표 버튼 — 누르면 짧은 설명 팝오버가 뜨고, 바깥 클릭·Esc 로 닫힌다.
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  /** 버튼의 aria-label — 스크린리더용, "OO이 뭔지 설명 보기" 형태를 권장한다. */
  label: string
  children: ReactNode
}

export function HelpTooltip({ label, children }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        ?
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-10 w-64 rounded-2xl border border-line bg-elevated p-3 text-[12px] leading-relaxed text-muted shadow-soft-sm"
        >
          {children}
        </div>
      )}
    </div>
  )
}
