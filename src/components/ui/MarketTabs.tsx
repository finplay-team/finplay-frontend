// 주식/코인 시장 전환 탭 — 활성 색이 시장 액센트(민트/앰버)를 따라간다
import type { Market } from '../../services/types'

/**
 * 주식 탭만 브랜드 민트 대신 같은 색상 계열의 더 진한 딥 틸을 쓴다(2026-08-18 피드백 — 파란색은
 * "하락/매도"에 이미 쓰이는 loss 톤과 겹쳐 보여 제외, 그렇다고 브랜드 민트를 그대로 쓰면 주식만의
 * 구분이 사라져서 같은 hue 를 유지한 채 명도·채도만 낮췄다). 토큰화하지 않고 이 탭 버튼에만
 * 임의값으로 넣는다 — 다른 곳(브랜드 민트)에는 영향 없다.
 */
// 코인이 우선 시장이라 탭도 코인을 먼저 보여준다.
const items: { value: Market; label: string; activeTone: string }[] = [
  { value: 'CRYPTO', label: '코인', activeTone: 'bg-coin text-coin-ink' },
  { value: 'STOCK', label: '주식', activeTone: 'bg-[#0D9488] text-[#ECFDF9]' },
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
