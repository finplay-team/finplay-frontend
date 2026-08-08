// 랜딩 튜토리얼 섹션의 애스트로넛 마스코트 — 커서를 따라 고개를 돌리는 SVG 구현
import { useEffect, useRef, useState } from 'react'

/**
 * 3D(.glb + @react-three/fiber) 교체를 전제로 만든 컴포넌트다.
 * 교체 시 이 파일만 바꾸면 되도록 바깥에 노출하는 것은 className 하나뿐으로 둔다.
 * 지금 SVG 로 두는 이유는 의존성 0KB 로 같은 역할(시선 유도)을 하기 때문이다.
 */
interface Props {
  className?: string
}

export function Mascot({ className = '' }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  // -1~1 범위의 시선 오프셋. 고개와 눈동자가 커서를 향한다.
  const [gaze, setGaze] = useState({ x: 0, y: 0 })

  useEffect(() => {
    // 터치 기기에는 커서가 없어 추적이 의미 없다 — 부유 애니메이션만 남긴다
    if (!window.matchMedia('(hover: hover)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let pending: { x: number; y: number } | null = null

    const apply = () => {
      frame = 0
      if (!pending) return
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // 화면 절반 거리에서 최대치에 도달하도록 정규화하고 -1~1 로 자른다
      const nx = (pending.x - cx) / (window.innerWidth / 2)
      const ny = (pending.y - cy) / (window.innerHeight / 2)
      setGaze({
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      })
    }

    const onMove = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY }
      if (frame) return
      frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <svg
      ref={ref}
      viewBox="0 0 240 300"
      className={`animate-float-orb ${className}`}
      role="img"
      aria-label="FinPlay 마스코트 애스트로넛"
    >
      <defs>
        {/* 헬멧 유리 — 위쪽이 밝고 아래로 어두워지는 구면 반사 */}
        <radialGradient id="mascot-visor" cx="38%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#123B38" />
          <stop offset="55%" stopColor="#0B2422" />
          <stop offset="100%" stopColor="#04201D" />
        </radialGradient>
        <linearGradient id="mascot-helmet" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#F4F4F6" />
          <stop offset="60%" stopColor="#D8D8E0" />
          <stop offset="100%" stopColor="#9A9AA6" />
        </linearGradient>
        <linearGradient id="mascot-suit" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#EDEDF2" />
          <stop offset="65%" stopColor="#C9C9D4" />
          <stop offset="100%" stopColor="#8E8E9A" />
        </linearGradient>
      </defs>

      {/* 발밑 민트 글로우 — 떠 있다는 느낌의 근거 */}
      <ellipse cx="120" cy="286" rx="52" ry="8" fill="#5EEAD4" opacity="0.16" />

      {/* 고개는 커서 방향으로 아주 조금만 기운다. 과하면 불쾌해진다. */}
      <g
        style={{
          transform: `translate(${gaze.x * 5}px, ${gaze.y * 3}px) rotate(${gaze.x * 3}deg)`,
          transformOrigin: '120px 150px',
          transition: 'transform 500ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* 백팩 */}
        <rect x="70" y="150" width="100" height="74" rx="22" fill="#8E8E9A" />

        {/* 몸통 */}
        <rect x="80" y="146" width="80" height="86" rx="26" fill="url(#mascot-suit)" />

        {/* 가슴 제어판 — 민트가 브랜드를 잡아 주는 유일한 지점 */}
        <rect x="97" y="168" width="46" height="30" rx="8" fill="#04201D" />
        <rect x="103" y="175" width="13" height="4" rx="2" fill="#5EEAD4" />
        <rect x="103" y="184" width="20" height="4" rx="2" fill="#5EEAD4" opacity="0.55" />
        <circle cx="134" cy="186" r="4" fill="#FBBF24" className="animate-pulse-soft" />

        {/* 팔 */}
        <rect x="52" y="156" width="26" height="62" rx="13" fill="url(#mascot-suit)" />
        <rect x="162" y="156" width="26" height="62" rx="13" fill="url(#mascot-suit)" />
        {/* 장갑 */}
        <circle cx="65" cy="222" r="14" fill="#B4B4C0" />
        <circle cx="175" cy="222" r="14" fill="#B4B4C0" />

        {/* 다리 */}
        <rect x="92" y="226" width="24" height="46" rx="12" fill="url(#mascot-suit)" />
        <rect x="124" y="226" width="24" height="46" rx="12" fill="url(#mascot-suit)" />
        {/* 부츠 */}
        <rect x="86" y="262" width="32" height="18" rx="9" fill="#B4B4C0" />
        <rect x="122" y="262" width="32" height="18" rx="9" fill="#B4B4C0" />

        {/* 헬멧 셸 */}
        <circle cx="120" cy="96" r="62" fill="url(#mascot-helmet)" />
        {/* 목 링 */}
        <rect x="98" y="150" width="44" height="12" rx="6" fill="#B4B4C0" />

        {/* 바이저 */}
        <ellipse cx="120" cy="96" rx="47" ry="44" fill="url(#mascot-visor)" />

        {/* 얼굴 — 바이저 안. 눈은 고개보다 조금 더 많이 움직인다. */}
        <g
          style={{
            transform: `translate(${gaze.x * 7}px, ${gaze.y * 5}px)`,
            transition: 'transform 400ms cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          <ellipse cx="104" cy="96" rx="5.5" ry="7" fill="#F4F4F6" />
          <ellipse cx="136" cy="96" rx="5.5" ry="7" fill="#F4F4F6" />
          {/* 입 — 살짝 웃는 곡선 */}
          <path
            d="M112 112 Q120 118 128 112"
            fill="none"
            stroke="#F4F4F6"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.75"
          />
        </g>

        {/* 바이저 스페큘러 하이라이트 — 유리 두께를 만든다. 얼굴 위에 올라가야 유리 안쪽처럼 보인다. */}
        <ellipse cx="100" cy="74" rx="19" ry="13" fill="#F4F4F6" opacity="0.17" transform="rotate(-22 100 74)" />
        <ellipse cx="139" cy="118" rx="9" ry="5" fill="#5EEAD4" opacity="0.13" />

        {/* 헬멧 테두리 하이라이트 */}
        <circle
          cx="120"
          cy="96"
          r="62"
          fill="none"
          stroke="#F4F4F6"
          strokeWidth="1.5"
          opacity="0.28"
        />
      </g>
    </svg>
  )
}
