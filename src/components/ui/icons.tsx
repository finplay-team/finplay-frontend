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



/**
 * 관심목록 토글용. 등록 상태는 호출부에서 `fill="currentColor"` 로 채워 표현한다
 * (별도 아이콘을 두 개 만들지 않는다).
 */
export const Star = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
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

export const Coin = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M14.5 9.5A2.5 2.5 0 0 0 12 8h-1.5M9.5 12h3M9.5 15h2.5a2.5 2.5 0 0 0 2.5-1.5M11 8v8" />
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




/**
 * 좋아요 버튼용. Star 와 같은 방식으로 눌린 상태는 호출부가 `fill="currentColor"` 로 채워 표현한다.
 */
export const Heart = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 20.5 4.6 13.2a5 5 0 0 1 7.1-7.1l.3.3.3-.3a5 5 0 0 1 7.1 7.1L12 20.5Z" />
  </svg>
)

export const Refresh = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5" />
  </svg>
)

export const Logout = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 12h11M17 8l4 4-4 4" />
  </svg>
)

/** 협상·논의·제휴 소식용 — 겹치는 원 두 개로 "만남·합의"를 나타낸다. */
export const Handshake = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
  </svg>
)

/** 가동 중단·공급 차질 등 경고성 소식용. */
export const Warning = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 4 3 20h18L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
)

/** 루머·소문 소식용 말풍선. */
export const ChatBubble = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="4" y="5" width="16" height="10" rx="3" />
    <path d="M9 15v4l4-4" />
  </svg>
)

/** 사건 목록의 기본(범주를 알 수 없는) 아이콘. */
export const Newspaper = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </svg>
)
