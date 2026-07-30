// 떠 있는 글래스 pill 내비게이션과 햄버거 X 모프 풀스크린 오버레이
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { tradeService } from '../services/tradeService'
import { formatManEok } from '../lib/format'
import { LinkButton } from './ui/Button'
import { Logout } from './ui/icons'

const publicLinks = [
  { to: '/', label: '홈' },
  { to: '/rankings', label: '랭킹' },
  { to: '/support', label: '고객센터' },
]

/** 로그인 시 추가로 노출되는 메뉴 */
const authLinks = [
  { to: '/trade', label: '거래' },
  { to: '/me', label: '내정보' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const { isAuthenticated, isAdmin, user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // 라우트 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // 메뉴 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const navLinks = [...publicLinks, ...(isAuthenticated ? authLinks : [])]

  // 로그인 시 총 보유자산·주문가능 현금을 주기적으로 갱신해 표시
  const [wallet, setWallet] = useState<{ total: number; cash: number } | null>(null)
  useEffect(() => {
    if (!user) {
      setWallet(null)
      return
    }
    const read = () => {
      const ids = (['STOCK', 'CRYPTO'] as const)
        .map((m) => tradeService.getAccountId(user.id, m))
        .filter((id): id is string => !!id)
      if (!ids.length) {
        setWallet(null)
        return
      }
      const summaries = ids.map((id) => tradeService.getSummarySync(id))
      setWallet({
        total: summaries.reduce((s, x) => s + x.totalValue, 0),
        cash: summaries.reduce((s, x) => s + x.cashBalance, 0),
      })
    }
    read()
    const id = setInterval(read, 2500)
    return () => clearInterval(id)
  }, [user])

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      <nav className="mt-5 flex w-full max-w-5xl items-center justify-between rounded-full border border-black/[0.06] bg-white/70 py-2 pl-5 pr-2 shadow-soft-sm backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[13px] font-bold text-white">
            i
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Investory</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full px-3.5 py-2 text-sm text-muted transition-colors duration-300 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin"
              className="rounded-full px-3.5 py-2 text-sm text-muted transition-colors duration-300 hover:text-ink"
            >
              관리자
            </Link>
          )}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <>
              {wallet && (
                <Link
                  to="/me"
                  className="flex items-center gap-2 rounded-full bg-black/[0.04] px-3.5 py-2 text-xs transition-colors duration-300 hover:bg-black/[0.07]"
                  title="총 보유자산 · 주문가능 현금"
                >
                  <span className="text-muted">
                    보유 <span className="font-display font-semibold text-ink tabular">{formatManEok(wallet.total)}</span>
                  </span>
                  <span className="h-3 w-px bg-black/10" />
                  <span className="text-muted">
                    가능 <span className="font-display font-semibold text-brand tabular">{formatManEok(wallet.cash)}</span>
                  </span>
                </Link>
              )}
              <span className="text-sm text-muted">
                <span className="font-medium text-ink">{user?.nickname}</span>님
              </span>
              <button
                onClick={handleLogout}
                className="group flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm text-ink ring-1 ring-black/[0.06] transition-all duration-400 ease-spring hover:bg-white active:scale-[0.98]"
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

        {/* 모바일 햄버거 → X 모프 */}
        <button
          aria-label="메뉴"
          onClick={() => setOpen((v) => !v)}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/70 ring-1 ring-black/[0.06] md:hidden"
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
        className={`fixed inset-0 z-30 flex flex-col justify-center bg-white/80 px-6 backdrop-blur-2xl transition-all duration-500 ease-spring md:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex flex-col gap-1">
          {[...navLinks, ...(isAdmin ? [{ to: '/admin', label: '관리자' }] : [])].map((l, i) => (
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
              className="rounded-full bg-ink px-6 py-3.5 text-center text-[15px] font-medium text-white"
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
