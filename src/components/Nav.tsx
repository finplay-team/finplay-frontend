// 떠 있는 글래스 pill 내비게이션과 햄버거 X 모프 풀스크린 오버레이
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTutorialProgress } from '../hooks/useTutorialProgress'
import { LinkButton } from './ui/Button'
import { Logout } from './ui/icons'

/**
 * emoji·description은 모바일 풀스크린 메뉴에서만 쓴다(2026-08-24 피드백 — 큰 글씨만 있어 각
 * 항목이 무엇을 하는 화면인지 이름만으로 짐작해야 했다). lg 이상의 pill 메뉴는 폭이 좁아 이름
 * 하나로도 이미 붐빈다 — 그 자리는 그대로 라벨만 쓴다.
 */
const supportLink = { to: '/support', label: '고객센터', emoji: '💬', description: '문의하고 도움받기' }

/**
 * 로그인 시 추가로 노출되는 메뉴.
 * 투자일기는 여기 없다 — 포트폴리오 화면 안(체결 내역 아래 미리보기 + "전체보기")으로 옮겼다.
 * `/journal` 라우트 자체는 그대로 있다.
 * 커뮤니티도 같은 이유로 여기 없다 — 종목별 게시판이라 모의투자 화면 안(선택 종목 미리보기 +
 * "더보기")으로 들어가는 진입점만 두고, 종목 맥락 없는 상단 메뉴는 없앴다. `/community` 라우트
 * 자체는 그대로 있다.
 */
const authLinks = [
  { to: '/news', label: '뉴스', emoji: '📰', description: '시장 소식과 시황 브리핑' },
  { to: '/tutorial', label: '튜토리얼', emoji: '🎓', description: '따라 하며 배우는 첫 연습' },
  { to: '/trade', label: '모의투자', emoji: '📈', description: '실시간 시세로 매매 연습' },
  { to: '/portfolio', label: '포트폴리오', emoji: '💼', description: '내 자산과 체결 내역' },
  { to: '/feedback', label: 'AI 복기', emoji: '🤖', description: '오늘 매매를 되짚어보기' },
  { to: '/rankings', label: '랭킹', emoji: '🏆', description: '다른 사용자와 성과 비교' },
  { to: '/me', label: '내정보', emoji: '👤', description: '계정 정보와 내 활동' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const { status, member, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAuthenticated = status !== 'anonymous'

  /**
   * 튜토리얼을 아직 다 끝내지 않은 로그인 사용자에게만 점을 붙인다 — 초보자에게 어디부터
   * 눌러야 하는지 알려주는 유일한 신호다. 아직 읽는 중이거나 조회가 실패했으면 붙이지 않는다
   * (없는 상태를 근거로 재촉하지 않는다).
   */
  const { loading: tutorialLoading, error: tutorialError, allCompleted } = useTutorialProgress()
  const showTutorialNudge = isAuthenticated && !tutorialLoading && !tutorialError && !allCompleted

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

  const navLinks = [...(isAuthenticated ? authLinks : []), supportLink]

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
              // startsWith만 쓰면 "/trades"가 "/trade"의 접두사라 모의투자 탭이 잘못 켜진다
              // (2026-08-22 피드백) — 경로 경계(정확히 일치하거나 다음이 '/')까지 확인한다.
              const active = location.pathname === l.to || location.pathname.startsWith(`${l.to}/`)
              const nudge = showTutorialNudge && l.to === '/tutorial'
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors duration-300 ${
                    active ? 'bg-white/[0.06] text-ink' : nudge ? 'font-medium text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {l.label}
                  {nudge && (
                    <>
                      <span
                        aria-hidden
                        className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle"
                      />
                      <span className="sr-only"> (아직 완료하지 않았습니다)</span>
                    </>
                  )}
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

        {/*
          모바일(<lg)에서 로그인 상태를 간단히 보여준다 — 데스크톱(lg 이상)의 닉네임·로그아웃
          한 줄은 lg:hidden에 가려 모바일에는 로그인 여부를 알 방법이 메뉴를 열어 맨 아래
          "로그아웃" 버튼을 보는 것뿐이었다(2026-08-24 피드백 — "메인화면 오른쪽 위에 간략히
          내 프로필과 로그인 상태가 표시됐으면"). 닉네임 첫 글자 아바타 + 살아있다는 점만 얹는다 —
          처음엔 아바타 옆에 전체 닉네임도 같이 적었는데, 닉네임이 아바타 글자와 같은 음절로
          시작하면("튜토리얼테스터" → 아바타 "튜" + 옆 글자 "튜토리얼테스터") 오타처럼 겹쳐
          보였다(실측). 아바타 하나로 충분히 "간략"하고, 전체 이름은 눌러서 가는 내정보와 메뉴
          안에 이미 있다.
        */}
        {isAuthenticated && (
          <Link
            to="/me"
            aria-label={`내정보 — ${member?.nickname ?? ''}님으로 로그인함`}
            className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink transition-transform active:scale-95 lg:hidden"
          >
            {member?.nickname?.charAt(0) ?? ''}
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse-soft rounded-full bg-brand ring-2 ring-canvas"
            />
          </Link>
        )}

        {/*
          모바일 햄버거 → X 모프. 아이콘만 있으면 "이게 눌리는 버튼인지, 메뉴가 맞는지"를 아이콘
          관례에 익숙하지 않은 사용자는 못 알아볼 수 있다(2026-08-24 피드백 — 40~50대 사용자 편의).
          그래서 아이콘 옆에 "메뉴"/"닫기" 글자를 더한다 — 아이콘은 계속 X로 바뀌지만, 글자가 상태를
          다시 한번 말로 확인해 준다.
          lg 미만에서는 메뉴가 접혀 있어 링크 옆 점이 보이지 않는다 — 버튼 자체에 점을 얹어야
          접힌 상태에서도 신호가 남는다. 메뉴를 연 동안에는 안쪽 링크가 점을 대신하므로 숨긴다.
        */}
        <button
          aria-label={showTutorialNudge && !open ? '메뉴 (튜토리얼을 아직 완료하지 않았습니다)' : '메뉴'}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="relative flex h-10 items-center gap-2 rounded-full bg-white/[0.04] pl-3.5 pr-4 ring-1 ring-white/[0.08] lg:hidden"
        >
          {showTutorialNudge && !open && (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand ring-2 ring-canvas"
            />
          )}
          <span className="relative flex h-4 w-4 flex-none items-center justify-center" aria-hidden>
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
          </span>
          <span className="text-sm font-medium text-ink">{open ? '닫기' : '메뉴'}</span>
        </button>
      </nav>

      {/*
        풀스크린 글래스 오버레이. 예전엔 이름만 text-4xl로 큼직하게 나열했다 — 처음 오는 사람은
        "AI 복기"·"랭킹" 같은 이름만으로 그 화면이 뭘 하는 곳인지 짐작해야 했다(2026-08-24 피드백).
        이모지 아이콘 + 한 줄 설명을 더해 각 행이 스스로 무엇을 하는지 말하게 하고, 줄 사이 구분선과
        패딩으로 탭 영역을 넓혔다.

        가운데 정렬을 justify-center로 하면 내용이 뷰포트보다 커질 때 **위쪽이 잘리고 스크롤로도
        닿지 않는다** — flex justify-center가 넘치는 만큼을 위·아래로 똑같이 밀어내는데, 스크롤은
        양수 방향(아래)만 되고 음수 방향(위로 밀려난 만큼)은 갈 수 없기 때문이다. 실제로 첫 항목
        "뉴스"의 윗부분이 화면 밖으로 잘려 스크롤해도 안 보였다(2026-08-24 실사용 보고). margin:auto
        (m-auto) 방식으로 바꾼다 — 이 방식은 넘칠 때 auto 여백이 0으로 접혀 콘텐츠가 자연히 맨 위에
        붙고, overflow-y-auto로 전부 스크롤해 닿을 수 있다. 다 안 넘칠 때는 지금처럼 가운데 그대로다.
      */}
      <div
        className={`fixed inset-0 z-30 flex overflow-y-auto bg-canvas/90 px-6 py-24 backdrop-blur-2xl transition-all duration-500 ease-spring lg:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="m-auto w-full">
        <div className="flex flex-col">
          {navLinks.map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-4 border-b border-white/[0.06] py-4 transition-all duration-500 ease-spring first:border-t active:scale-[0.99] ${
                open ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
              }`}
              style={{ transitionDelay: open ? `${100 + i * 60}ms` : '0ms' }}
            >
              <span
                aria-hidden
                className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/[0.04] text-xl"
              >
                {l.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-ink">
                  {l.label}
                  {showTutorialNudge && l.to === '/tutorial' && (
                    <>
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand" />
                      <span className="sr-only"> (아직 완료하지 않았습니다)</span>
                    </>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{l.description}</span>
              </span>
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
      </div>
    </header>
  )
}
