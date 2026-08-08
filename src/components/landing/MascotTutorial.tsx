// 마스코트가 시작 3단계를 안내하는 랜딩 섹션 — 단계 내용은 전부 실제 백엔드 동작이다
import { Mascot } from './Mascot'
import { Reveal } from '../ui/Reveal'

/**
 * 근거: 가입 시 STOCK·CRYPTO 계좌 동시 생성 + 계좌별 시드머니 1,000만원(AUTH-001),
 * 주식 09:00~15:30 재생·코인 24시간(MKT-002·MKT-008), 매도 회고 작성(JOUR-003)과
 * 매도 직후 피드백이 그 체결의 서비스 날짜 15:30 이후 개방(FEED-007 §C-5).
 * 순서 자체가 정보라서 번호를 붙인다.
 */
const steps = [
  {
    n: '01',
    title: '계좌 두 개가 함께 생깁니다',
    body: '가입하면 주식 계좌와 코인 계좌가 동시에 만들어지고, 각각 1,000만원이 들어옵니다. 두 계좌 사이 이체는 없습니다.',
  },
  {
    n: '02',
    title: '장이 열리면 주문합니다',
    body: '주식은 09:00부터 15:30까지 그날의 분봉이 재생되는 동안, 코인은 24시간 언제든 주문할 수 있습니다.',
  },
  {
    n: '03',
    title: '팔고 나면 복기가 붙습니다',
    body: '매도 회고를 직접 적고, 마감 후에는 다른 시점에 팔았다면 어땠는지가 수치로 따라옵니다.',
  },
]

export function MascotTutorial() {
  return (
    <section className="relative overflow-hidden px-4 py-20 md:py-28">
      <div aria-hidden className="orb -right-24 top-1/3 h-80 w-80" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
        {/* 마스코트 — 모바일에서는 위, 데스크톱에서는 좌측 */}
        <Reveal className="mx-auto w-full max-w-[18rem] lg:max-w-none">
          {/* 말풍선은 일반 흐름에 두어 헬멧을 덮지 않게 한다. 꼬리만 아래를 향한다. */}
          <div className="glass glass-sheen relative ml-auto w-fit max-w-[15rem] px-4 py-2.5">
            <p className="text-xs font-semibold leading-snug text-ink">
              처음이라도 <span className="text-brand">3단계면</span> 첫 주문까지 갑니다.
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
        </div>
      </div>
    </section>
  )
}
