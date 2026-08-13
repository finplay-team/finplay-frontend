// 떠 있는 글래스 pill 내비게이션과 햄버거 X 모프 풀스크린 오버레이
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getAccountSummary } from '../services/accountService'
import { getAccountRevision, subscribeAccount } from '../lib/accountPulse'
import { formatManEok } from '../lib/format'
import { LinkButton } from './ui/Button'
import { Logout } from './ui/icons'

const publicLinks = [
  { to: '/', label: '홈' },
  { to: '/support', label: '고객센터' },
]

/** 로그인 시 추가로 노출되는 메뉴 */
const authLinks = [
  { to: '/tutorial', label: '실습' },
  { to: '/news', label: '뉴스' },
  { to: '/trade', label: '거래' },
  { to: '/portfolio', label: '포트폴리오' },
  { to: '/feedback', label: 'AI 복기' },
  { to: '/journal', label: '투자일기' },
  { to: '/rankings', label: '랭킹' },
  { to: '/community', label: '커뮤니티' },
  { to: '/me', label: '내정보' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const { status, member, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthenticated = status !== 'anonymous'
  const [wallet, setWallet] = useState<{ totalValue: number; availableCash: number } | null>(null)
  const accountRevision = useSyncExternalStore(subscribeAccount, getAccountRevision)
  // 튜토리얼 중에는 샘플 종목 매매·완료 보상이 이 숫자에 섞여 실제 자산처럼 보이므로 숨긴다.
  // 정확히 이 경로일 때만 — startsWith면 나중에 /tutorial-preview 같은 경로가 생겨도 잘못 걸린다.
  const isTutorialRoute = location.pathname === '/tutorial'

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

  // 주기 폴링 없이 화면 이동마다, 그리고 주문 체결로 잔고가 바뀐 직후에만 읽는다.
  // 잔고는 SSE에 실려오지 않으므로 체결한 화면이 bumpAccount()로 알려줘야 한다.
  // 실패하면 0원을 보여주는 대신 pill 을 숨긴다.
  useEffect(() => {
    if (status !== 'authenticated') {
      setWallet(null)
      return
    }
    let cancelled = false
    // 주식만 읽으면 코인에서 매매해도 내비 숫자가 안 움직여 "가능 현금 1,000만"이 계속 남는다.
    // 두 계좌를 합산한다 — 수익률은 표시하지 않으므로 분모가 어긋나는 문제(4차 결정)가 없다.
    Promise.all([getAccountSummary('STOCK'), getAccountSummary('CRYPTO')])
      .then(([stock, crypto]) => {
        if (cancelled) return
        setWallet({
          totalValue: stock.totalValue + crypto.totalValue,
          // 예약분을 빼야 실제 주문 가능액이다. 서버는 availableCash 를 주지 않는다.
          availableCash:
            stock.cashBalance - stock.reservedCash + (crypto.cashBalance - crypto.reservedCash),
        })
      })
      .catch(() => {
        if (!cancelled) setWallet(null)
      })
    return () => {
      cancelled = true
    }
  }, [status, location.pathname, accountRevision])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const navLinks = [...publicLinks, ...(isAuthenticated ? authLinks : [])]

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      {/* relative z-40 이 없으면 아래 풀스크린 오버레이(z-30)가 pill 위에 깔려 X 버튼을 덮는다 */}
      <nav className="relative z-40 mt-5 flex w-full max-w-6xl items-center justify-between rounded-full border border-white/[0.08] bg-canvas/70 py-2 pl-5 pr-2 shadow-soft-sm backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-brand-ink">
            i
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Investory</span>
        </Link>

        {/* md(768px)에서 펼치면 메뉴·지갑·닉네임이 전부 두세 줄로 접힌다 → lg 부터 펼친다 */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => {
            const active =
              l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to)
            return (
              <Link
                key={l.to}
                to={l.to}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors duration-300 ${
                  active ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <>
              {wallet && !isTutorialRoute && (
                <Link
                  to="/me"
                  className="flex items-center gap-3 rounded-full bg-white/[0.04] px-4 py-1.5 ring-1 ring-white/[0.08] transition-colors duration-300 hover:bg-white/[0.08]"
                >
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-eyebrow text-muted">평가자산</span>
                    <span className="text-sm font-medium text-ink tabular">
                      {formatManEok(wallet.totalValue)}
                    </span>
                  </span>
                  <span className="h-6 w-px bg-line" aria-hidden />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-eyebrow text-muted">가능 현금</span>
                    <span className="text-sm font-medium text-brand tabular">
                      {formatManEok(wallet.availableCash)}
                    </span>
                  </span>
                </Link>
              )}
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
            <>
              {wallet && !isTutorialRoute && (
                <Link
                  to="/me"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4"
                >
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-eyebrow text-muted">평가자산</span>
                    <span className="text-base font-medium text-ink tabular">
                      {formatManEok(wallet.totalValue)}
                    </span>
                  </span>
                  <span className="flex flex-col text-right leading-tight">
                    <span className="text-[10px] uppercase tracking-eyebrow text-muted">가능 현금</span>
                    <span className="text-base font-medium text-brand tabular">
                      {formatManEok(wallet.availableCash)}
                    </span>
                  </span>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="rounded-full bg-brand px-6 py-3.5 text-center text-[15px] font-medium text-brand-ink shadow-glow"
              >
                로그아웃
              </button>
            </>
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
