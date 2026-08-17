// 떠 있는 글래스 pill 내비게이션과 햄버거 X 모프 풀스크린 오버레이
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LinkButton } from './ui/Button'
import { Logout } from './ui/icons'

const publicLinks = [
  { to: '/', label: '홈' },
  { to: '/support', label: '고객센터' },
]

/**
 * 로그인 시 추가로 노출되는 메뉴.
 * 투자일기는 여기 없다 — 포트폴리오 화면 안(체결 내역 아래 미리보기 + "전체보기")으로 옮겼다.
 * `/journal` 라우트 자체는 그대로 있다.
 * 커뮤니티도 같은 이유로 여기 없다 — 종목별 게시판이라 모의투자 화면 안(선택 종목 미리보기 +
 * "더보기")으로 들어가는 진입점만 두고, 종목 맥락 없는 상단 메뉴는 없앴다. `/community` 라우트
 * 자체는 그대로 있다.
 */
const authLinks = [
  { to: '/tutorial', label: '튜토리얼' },
  { to: '/news', label: '뉴스' },
  { to: '/trade', label: '모의투자' },
  { to: '/portfolio', label: '포트폴리오' },
  { to: '/feedback', label: 'AI 복기' },
  { to: '/rankings', label: '랭킹' },
  { to: '/me', label: '내정보' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const { status, member, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthenticated = status !== 'anonymous'

  // 라우트 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // 메뉴 열림 동안 배경 스크롤 잠금 + Esc 로 닫기
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) return () => {
      document.body.style.overflow = ''
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const navLinks = [...publicLinks, ...(isAuthenticated ? authLinks : [])]

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      {/* relative z-40 이 없으면 아래 풀스크린 오버레이(z-30)가 pill 위에 깔려 X 버튼을 덮는다 */}
      {/*
        너비를 콘텐츠에 맞춰 줄인다(w-full max-w-6xl 제거) — 링크가 몇 개든 pill이 화면 폭까지
        늘어나 로고와 첫 링크 사이에 justify-between이 억지로 넓은 여백을 만들던 문제였다.
        gap-8 이 그 여백을 대신한다.
      */}
      <nav className="relative z-40 mt-5 inline-flex items-center gap-6 rounded-full border border-white/[0.08] bg-canvas/70 py-2 pl-5 pr-2 shadow-soft-sm backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-brand-ink">
            f
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">FinPlay</span>
        </Link>

        {/*
          md(768px)에서 펼치면 메뉴·닉네임이 전부 두세 줄로 접힌다 → lg 부터 펼친다.
          링크 목록과 우측 액션을 한 justify-between 자식으로 묶어야 한다 — 따로 두면 지갑 pill이
          빠진 뒤 justify-between이 남는 공간을 전부 이 사이에 밀어넣어 닉네임이 화면 끝으로 붙는다.
        */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className="flex items-center gap-1">
            {navLinks.map((l) => {
              const active =
                l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to)
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors duration-300 ${
                    active ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {l.label}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="whitespace-nowrap text-sm text-muted">
                  <span className="font-medium text-ink">{member?.nickname}</span>님
                </span>
                <button
                  onClick={handleLogout}
                  className="group flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.04] px-4 py-2 text-sm text-ink ring-1 ring-white/[0.08] transition-all duration-400 ease-spring hover:bg-white/[0.08] active:scale-[0.98]"
                >
                  로그아웃
                  <Logout width={15} height={15} className="text-muted" />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors hover:text-brand"
                >
                  로그인
                </Link>
                <LinkButton to="/signup" size="md" withIcon>
                  시작하기
                </LinkButton>
              </>
            )}
          </div>
        </div>

        {/* 모바일 햄버거 → X 모프 */}
        <button
          aria-label="메뉴"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.08] lg:hidden"
        >
          <span
            className={`absolute h-[1.5px] w-4 bg-ink transition-all duration-500 ease-spring ${
              open ? 'rotate-45' : '-translate-y-1'
            }`}
          />
          <span
            className={`absolute h-[1.5px] w-4 bg-ink transition-all duration-500 ease-spring ${
              open ? '-rotate-45' : 'translate-y-1'
            }`}
          />
        </button>
      </nav>

      {/* 풀스크린 글래스 오버레이 */}
      <div
        className={`fixed inset-0 z-30 flex flex-col justify-center bg-canvas/90 px-6 backdrop-blur-2xl transition-all duration-500 ease-spring lg:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex flex-col gap-1">
          {navLinks.map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={`font-display text-4xl font-semibold tracking-tight text-ink transition-all duration-500 ease-spring ${
                open ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
              }`}
              style={{ transitionDelay: open ? `${100 + i * 60}ms` : '0ms' }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div
          className={`mt-12 flex flex-col gap-3 transition-all duration-500 ease-spring ${
            open ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
          }`}
          style={{ transitionDelay: open ? '360ms' : '0ms' }}
        >
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="rounded-full bg-brand px-6 py-3.5 text-center text-[15px] font-medium text-brand-ink shadow-glow"
            >
              로그아웃
            </button>
          ) : (
            <>
              <LinkButton to="/signup" size="lg" withIcon className="justify-between">
                무료로 시작하기
              </LinkButton>
              <LinkButton to="/login" size="lg" variant="ghost">
                로그인
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
