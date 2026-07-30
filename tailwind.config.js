/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 다크가 유일한 테마다. 토큰 이름은 그대로 두고 값만 어둡게 바꿨으므로
        // `bg-canvas text-ink` 같은 기존 유틸리티가 자동으로 다크 톤을 따른다.
        canvas: '#0A0A0B', // 거의-검정 페이지 배경
        surface: '#131317', // 카드 이너 코어 — 배경보다 한 단 밝게
        elevated: '#1B1B21', // 표 헤더·입력·중첩 표면
        ink: '#F4F4F6', // 본문 텍스트 (이름 유지, 값 반전)
        muted: '#9A9AA6', // 보조 텍스트
        line: '#26262E', // 경계선
        // 포인트 컬러: 인디고 → 민트/틸
        brand: {
          DEFAULT: '#5EEAD4',
          soft: '#123B38', // 민트 칩·아이콘의 어두운 배경
          ink: '#04201D', // 민트 배경 위에 올리는 텍스트 (대비 확보)
        },
        // 코인 시장 액센트: 앰버. 다크 배경에서 읽히도록 400대.
        coin: {
          DEFAULT: '#FBBF24',
          soft: '#3A2A08', // 앰버 칩·활성 탭의 어두운 배경
          ink: '#231701', // 앰버 배경 위에 올리는 텍스트
        },
        // 등락 표기 (한국 관습: 상승 적색 / 하락 청색). 다크 배경에서 읽히도록 400대.
        gain: '#FB7185',
        loss: '#60A5FA',
      },
      fontFamily: {
        sans: ['Pretendard', 'Pretendard Variable', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Pretendard', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.2em',
      },
      borderRadius: {
        bezel: '2rem',
        core: 'calc(2rem - 0.375rem)',
      },
      boxShadow: {
        soft: '0 24px 70px -24px rgba(0,0,0,0.7)',
        'soft-sm': '0 12px 36px -18px rgba(0,0,0,0.6)',
        'soft-lg': '0 40px 120px -32px rgba(0,0,0,0.85)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        // 민트 글로우 — 강조 버튼·활성 상태에 사용
        glow: '0 0 40px -12px rgba(94,234,212,0.45)',
        'glow-lg': '0 0 120px -20px rgba(94,234,212,0.35)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32,0.72,0,1)',
      },
      transitionDuration: {
        400: '400ms',
      },
      keyframes: {
        'float-orb': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(0,-18px,0) scale(1.04)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'float-orb': 'float-orb 14s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
