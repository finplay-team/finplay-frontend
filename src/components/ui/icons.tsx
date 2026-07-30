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



export const Layers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m12 4 8 4-8 4-8-4 8-4Z" />
    <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
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




export const Logout = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 12h11M17 8l4 4-4 4" />
  </svg>
)
