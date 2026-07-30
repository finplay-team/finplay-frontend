// 랜딩 최상단 히어로 — 헤드라인, CTA, 검증 가능한 사실만 담은 요약 카드
import { LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'

/** 전부 실제 계약에서 나온 값이다. 사용자 수·수익률 같은 만들어낸 수치는 두지 않는다. */
const facts = [
  { label: '시드머니', value: '1,000만원' },
  { label: '거래 종목', value: '주식 16' },
  { label: '주문 유형', value: '시장가' },
  { label: '시세', value: '1분봉 재생' },
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
          <Eyebrow>주식 교육형 모의투자</Eyebrow>
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

      {/* 서비스 사실 요약 */}
      <Reveal delay={320} className="relative mx-auto mt-20 max-w-2xl">
        <Card accent="brand">
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            {facts.map((f) => (
              <div key={f.label} className="px-5 py-6 text-center">
                <dt className="text-[10px] uppercase tracking-eyebrow text-muted">{f.label}</dt>
                <dd className="mt-2 font-display text-lg font-semibold text-ink tabular">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-5 text-center text-xs text-muted">
          가입하면 가상 시드머니 1,000만원이 지급된 주식 계좌가 바로 생성됩니다.
        </p>
      </Reveal>
    </section>
  )
}
