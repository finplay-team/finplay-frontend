// 주식/코인 시장 전환 탭 — 활성 색이 시장 액센트(민트/앰버)를 따라간다
import type { Market } from '../../services/types'

const items: { value: Market; label: string; activeTone: string }[] = [
  { value: 'STOCK', label: '주식', activeTone: 'bg-brand text-brand-ink shadow-glow' },
  { value: 'CRYPTO', label: '코인', activeTone: 'bg-coin text-coin-ink' },
]

export function MarketTabs({
  market,
  onChange,
  className = '',
}: {
  market: Market
  onChange: (market: Market) => void
  className?: string
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08] ${className}`}
    >
      {items.map((item) => {
        const active = item.value === market
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
              active ? item.activeTone : 'text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
