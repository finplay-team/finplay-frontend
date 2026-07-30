// 랜딩 최상단 히어로 — 헤드라인, 1,000만원 시드 강조, CTA, 주식 계좌 미리보기 카드
import { LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { formatPercent, formatPnl, pnlTone } from '../../lib/format'

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
            투자를 기록하고,
            <br />
            <span className="text-brand">복기하고,</span> 성장한다
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-7 max-w-xl text-balance text-base leading-relaxed text-muted md:text-lg">
            실제 거래일 시세로 움직이는 가상 자산{' '}
            <span className="font-semibold text-ink">1,000만원</span>. 사고파는 순간의 판단을 남기고,
            결과와 대조하며 배우는 모의투자 플랫폼.
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

      {/* 계좌 미리보기 */}
      <Reveal delay={320} className="relative mx-auto mt-20 max-w-xl">
        <Card accent="brand">
          <PreviewAccount seed="1,000만원" value="1,184만" rate={12.4} pnl={1_240_000} />
        </Card>
        <p className="mt-5 text-center text-xs text-muted">
          가입하면 가상 시드머니 1,000만원이 지급된 주식 계좌가 바로 생성됩니다.
        </p>
      </Reveal>
    </section>
  )
}

function PreviewAccount({
  seed,
  value,
  rate,
  pnl,
}: {
  seed: string
  value: string
  rate: number
  pnl: number
}) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-eyebrow text-brand">
          주식 계좌
        </span>
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-muted">
          시드 {seed}
        </span>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">평가자산</p>
          <p className="font-display text-3xl font-semibold tabular">{value}</p>
        </div>
        <div className="text-right">
          <p className={`font-display text-lg font-semibold tabular ${pnlTone(rate)}`}>
            {formatPercent(rate)}
          </p>
          <p className="text-xs text-muted tabular">실현 {formatPnl(pnl)}</p>
        </div>
      </div>
    </div>
  )
}
