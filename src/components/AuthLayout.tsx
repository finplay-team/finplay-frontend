// 회원가입·로그인 페이지 공용 — 좌측 브랜드 패널 + 우측 폼 카드 레이아웃
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
  aside: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer, aside }: Props) {
  return (
    <div className="min-h-[100dvh] px-4 pb-16 pt-28">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-bezel bg-white shadow-soft lg:grid-cols-2">
        {/* 좌측 브랜드 패널 */}
        <div className="relative hidden overflow-hidden bg-ink p-10 lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-brand/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-coin/20 blur-3xl"
          />
          <Link to="/" className="relative flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[15px] font-bold text-ink">
              i
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-white">
              Investory
            </span>
          </Link>
          <div className="relative">{aside}</div>
        </div>

        {/* 우측 폼 */}
        <div className="p-8 sm:p-12">
          <div className="lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-[15px] font-bold text-white">
                i
              </span>
              <span className="font-display text-xl font-semibold tracking-tight">Investory</span>
            </Link>
          </div>
          <h1 className="mt-8 font-display text-3xl font-bold tracking-tight lg:mt-0">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        </div>
      </div>
    </div>
  )
}
