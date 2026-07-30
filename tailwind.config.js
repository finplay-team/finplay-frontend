/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F5F7',
        surface: '#FFFFFF',
        ink: '#0A0A0C',
        muted: '#6B6C74',
        line: '#E7E8EC',
        stock: '#4F46E5',
        coin: '#F59E0B',
        brand: {
          DEFAULT: '#4F46E5',
          soft: '#EEEDFC',
        },
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
        soft: '0 24px 70px -24px rgba(15,15,25,0.18)',
        'soft-sm': '0 12px 36px -18px rgba(15,15,25,0.16)',
        'soft-lg': '0 40px 120px -32px rgba(15,15,25,0.24)',
        inset: 'inset 0 1px 1px rgba(255,255,255,0.7)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32,0.72,0,1)',
      },
      transitionDuration: {
        '400': '400ms',
      },
      keyframes: {
        'float-orb': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(0,-18px,0) scale(1.04)' },
        },
      },
      animation: {
        'float-orb': 'float-orb 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
