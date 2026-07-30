// 랜딩 최상단 히어로 — 헤드라인, CTA, 검증 가능한 사실만 담은 요약 카드
import { LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'

/** 전부 실제 계약에서 나온 값이다. 사용자 수·수익률 같은 만들어낸 수치는 두지 않는다. */
const accounts = [
  {
    title: '주식 계좌',
    accent: 'brand' as const,
    tone: 'text-brand',
    facts: [
      { label: '시드머니', value: '1,000만원' },
      { label: '종목', value: '16' },
      { label: '거래 시간', value: '09:00–15:30' },
      { label: '시세', value: '1분봉 재생' },
    ],
  },
  {
    title: '코인 계좌',
    accent: 'coin' as const,
    tone: 'text-coin',
    facts: [
      { label: '시드머니', value: '1,000만원' },
      { label: '종목', value: '12' },
      { label: '거래 시간', value: '24시간' },
      { label: '시세', value: '빗썸 실시간' },
    ],
  },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-36 md:pt-44">
      {/* 은은한 민트 글로우 오브 */}
      <div aria-hidden className="orb -left-24 top-10 h-80 w-80 animate-float-orb" />
      <div
        aria-hidden
        className="orb -right-16 top-40 h-72 w-72 animate-float-orb"
        style={{ animationDelay: '3s' }}
      />

      <div className="relative mx-auto max-w-5xl text-center">
        <Reveal>
          <Eyebrow>주식·코인 교육형 모의투자</Eyebrow>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 font-display text-[13vw] font-bold leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
            실제로 있었던 하루를,
            <br />
            <span className="text-brand">지금처럼</span> 매매한다
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-7 max-w-xl text-balance text-base leading-relaxed text-muted md:text-lg">
            과거 거래일의 1분봉을 순서대로 다시 공개해, 실제 장이 열린 것처럼 움직입니다. 가상
            시드머니 <span className="font-semibold text-ink">1,000만원</span>으로 부담 없이 시장가
            매매를 연습해 보세요.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to="/signup" size="lg" withIcon>
              무료로 시작하기
            </LinkButton>
            <LinkButton to="/support" size="lg" variant="ghost">
              서비스 안내
            </LinkButton>
          </div>
        </Reveal>
      </div>

      {/* 듀얼 계좌 미리보기 — 가입 시 두 계좌가 동시에 생긴다 */}
      <Reveal delay={320} className="relative mx-auto mt-20 max-w-4xl">
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.title} accent={account.accent}>
              <div className="px-6 py-6">
                <p className={`font-display text-lg font-semibold ${account.tone}`}>
                  {account.title}
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                  {account.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-[10px] uppercase tracking-eyebrow text-muted">
                        {f.label}
                      </dt>
                      <dd className="mt-1.5 font-display text-base font-semibold text-ink tabular">
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          가입하면 각각 1,000만원이 지급된 주식·코인 계좌가 동시에 생성됩니다. 두 계좌 사이 이체는
          없습니다.
        </p>
      </Reveal>
    </section>
  )
}
