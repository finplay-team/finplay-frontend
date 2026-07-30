// 보유/거래내역 등 화면 내 구획을 나누는 pill 형태 세그먼트 탭
interface TabItem {
  value: string
  label: string
}

interface Props {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Tabs({ items, value, onChange, className = '' }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08] ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
              active ? 'bg-brand text-brand-ink shadow-glow' : 'text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
