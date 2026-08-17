// 마스코트가 튜토리얼 4단계를 안내하고 실제 튜토리얼로 보내는 랜딩 섹션 — 단계 내용은 전부 실제 동작이다
import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'
import { Reveal } from '../ui/Reveal'
import { LinkButton } from '../ui/Button'
import { useAuth } from '../../auth/AuthContext'

/**
 * 근거: /tutorial 의 실제 흐름(AttemptTutorialFlow) 그대로다 —
 * 샘플 종목 선택(attempt.status=SELECTING_INSTRUMENT) → 매수 시 서버가 체결가 기준
 * -3% 손절선·+5% 익절선 고정(riskSnapshot) → 차트 관찰(관찰 기록은 서버가 남긴다) →
 * 매도 후 복기 작성으로 완료. 완료 보상은 시장(주식·코인)별 최초 1회만 지급된다.
 * 순서 자체가 정보라서 번호를 붙인다.
 */
const steps = [
  {
    n: '01',
    title: '연습할 종목을 고릅니다',
    body: '교육용으로 만든 샘플 종목 중 하나를 고르면, 그 종목만의 차트가 시작됩니다. 실제 돈도, 실제 종목도 아닙니다.',
  },
  {
    n: '02',
    title: '수량을 정해 사 봅니다',
    body: '매수가 체결되면 그 값을 기준으로 손절선(-3%)과 익절선(+5%)을 서버가 자동으로 그려 줍니다. 직접 계산할 필요가 없습니다.',
  },
  {
    n: '03',
    title: '가격이 어디로 가는지 봅니다',
    body: '차트에서 가격이 두 선 중 어느 쪽으로 가는지 확인하면 됩니다. 확인했다는 기록은 서버가 알아서 남깁니다.',
  },
  {
    n: '04',
    title: '팔고 나서 한 줄 적습니다',
    body: '팔고 왜 그렇게 판단했는지 적으면 그 시장의 연습이 끝납니다. 주식과 코인은 따로 진행합니다.',
  },
]

export function MascotTutorial() {
  const { status } = useAuth()
  const isAuthenticated = status !== 'anonymous'

  return (
    <section className="relative overflow-hidden px-4 py-20 md:py-28">
      <div aria-hidden className="orb -right-24 top-1/3 h-80 w-80" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
        {/* 마스코트 — 모바일에서는 위, 데스크톱에서는 좌측 */}
        <Reveal className="mx-auto w-full max-w-[18rem] lg:max-w-none">
          {/* 말풍선은 일반 흐름에 두어 헬멧을 덮지 않게 한다. 꼬리만 아래를 향한다. */}
          <div className="glass glass-sheen relative ml-auto w-fit max-w-[15rem] px-4 py-2.5">
            <p className="text-xs font-semibold leading-snug text-ink">
              처음이라면 <span className="text-brand">짧은 연습</span>부터 해 보세요.
            </p>
            {/* 꼬리 — 유리와 같은 테두리·배경을 45도 회전시켜 만든다 */}
            <span
              aria-hidden
              className="absolute -bottom-1.5 right-8 h-3 w-3 rotate-45 border-b border-r border-white/[0.09] bg-white/[0.055]"
            />
          </div>

          <Mascot className="mt-3 w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]" />
        </Reveal>

        {/* 단계 */}
        <div>
          <Reveal>
            <h2 className="font-display text-3xl font-bold leading-[1.12] tracking-tight sm:text-4xl md:text-5xl">
              무엇부터 하면 되는지
              <br />
              <span className="text-brand">알려 드립니다</span>
            </h2>
          </Reveal>

          <ol className="mt-9 space-y-3">
            {steps.map((step, i) => (
              <Reveal key={step.n} delay={i * 90}>
                <li className="glass lift flex gap-4 px-5 py-4">
                  <span className="font-display text-sm font-bold tabular text-brand">{step.n}</span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold leading-snug text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          {/*
            비로그인 사용자를 /tutorial 로 보내면 ProtectedRoute 가 /login 으로 튕긴다 —
            계정이 아직 없는 첫 방문자에게는 어색해서 /signup 으로 보낸다. 가입 직후에는
            resolvePostAuthPath 가 두 시장 모두 NOT_STARTED 인 사용자를 /tutorial 로 보내므로
            "가입하면 바로 연습부터" 는 실제 동작이다.
          */}
          <Reveal delay={steps.length * 90}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LinkButton to={isAuthenticated ? '/tutorial' : '/signup'} size="lg" withIcon>
                먼저 연습해 보기
              </LinkButton>
              {!isAuthenticated && (
                <p className="text-sm leading-relaxed text-muted">
                  가입하면 바로 연습부터 시작합니다.{' '}
                  <Link to="/login" className="text-ink underline-offset-4 hover:underline">
                    이미 계정이 있다면 로그인
                  </Link>
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
