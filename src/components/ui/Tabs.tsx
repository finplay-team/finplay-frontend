// 주식/코인, 관리자 메뉴 등에 쓰는 pill 형태 세그먼트 탭
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
      className={`inline-flex items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-black/[0.05] ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
              active ? 'bg-ink text-white shadow-soft-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
