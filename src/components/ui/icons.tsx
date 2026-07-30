// 얇은 스트로크(Phosphor Light 계열) 인라인 SVG 아이콘 모음
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps): IconProps => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...props,
})

export const ArrowUpRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
)

export const ArrowRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
)

export const Notebook = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Z" />
    <path d="M6 4v16M3 8h3M3 12h3M3 16h3M10 8h6M10 12h4" />
  </svg>
)

export const Sparkle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3c.4 3.8 1.9 5.3 5.7 5.7-3.8.4-5.3 1.9-5.7 5.7-.4-3.8-1.9-5.3-5.7-5.7C10.1 8.3 11.6 6.8 12 3Z" />
    <path d="M18.5 14.5c.2 1.6.8 2.2 2.4 2.4-1.6.2-2.2.8-2.4 2.4-.2-1.6-.8-2.2-2.4-2.4 1.6-.2 2.2-.8 2.4-2.4Z" />
  </svg>
)

export const Layers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m12 4 8 4-8 4-8-4 8-4Z" />
    <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
  </svg>
)

export const Trophy = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 15h4M9 20h6M12 15v5" />
  </svg>
)

export const Target = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
)

export const Cpu = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" />
  </svg>
)

export const Shield = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const Bolt = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" />
  </svg>
)

export const Coin = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5" />
  </svg>
)

export const Chart = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16l3-4 3 2 4-6" />
  </svg>
)

export const Check = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m5 12 4.5 4.5L19 7" />
  </svg>
)

export const Menu = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 8h16M4 16h16" />
  </svg>
)

export const Close = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const User = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
)

export const Users = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 19c1-3.2 3.3-5 6-5s5 1.8 6 5" />
    <path d="M16 5.2A3.5 3.5 0 0 1 16 12M21 19c-.5-1.6-1.4-2.9-2.6-3.8" />
  </svg>
)

export const Calendar = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </svg>
)

export const Flag = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
  </svg>
)

export const Logout = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 12h11M17 8l4 4-4 4" />
  </svg>
)
