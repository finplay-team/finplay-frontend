// 랜딩 최상단 히어로 — 헤드라인, 1,000만원 시드 강조, CTA, 계좌 미리보기 카드
import { LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { formatPercent, formatPnl } from '../../lib/format'

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-36 md:pt-44">
      {/* 은은한 메시 글로우 오브 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-brand/20 blur-3xl animate-float-orb"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-coin/15 blur-3xl animate-float-orb"
        style={{ animationDelay: '3s' }}
      />

      <div className="relative mx-auto max-w-5xl text-center">
        <Reveal>
          <Eyebrow>주식 · 코인 교육형 모의투자</Eyebrow>
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
            실제 시세로 움직이는 가상 자산 <span className="font-semibold text-ink">1,000만원</span>.
            사고파는 순간의 판단을 남기고, 결과와 대조하며 배우는 모의투자 플랫폼.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to="/signup" size="lg" withIcon>
              무료로 시작하기
            </LinkButton>
            <LinkButton to="/rankings" size="lg" variant="ghost">
              랭킹 둘러보기
            </LinkButton>
          </div>
        </Reveal>
      </div>

      {/* 계좌 미리보기 — 주식/코인 분리 카드 */}
      <Reveal delay={320} className="relative mx-auto mt-20 max-w-4xl">
        <div className="grid gap-5 md:grid-cols-2">
          <Card accent="stock">
            <PreviewAccount
              tag="주식 계좌"
              tagColor="text-stock"
              seed="1,000만원"
              value="1,184만"
              rate={12.4}
              pnl={1_240_000}
            />
          </Card>
          <Card accent="coin">
            <PreviewAccount
              tag="코인 계좌"
              tagColor="text-coin"
              seed="1,000만원"
              value="931만"
              rate={-4.2}
              pnl={-420_000}
            />
          </Card>
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          주식 계좌와 코인 계좌는 완전히 분리되어 각각의 시드머니로 독립 운용됩니다.
        </p>
      </Reveal>
    </section>
  )
}

function PreviewAccount({
  tag,
  tagColor,
  seed,
  value,
  rate,
  pnl,
}: {
  tag: string
  tagColor: string
  seed: string
  value: string
  rate: number
  pnl: number
}) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-eyebrow ${tagColor}`}>{tag}</span>
        <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-muted">
          시드 {seed}
        </span>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">평가자산</p>
          <p className="font-display text-3xl font-semibold tabular">{value}</p>
        </div>
        <div className="text-right">
          <p className={`font-display text-lg font-semibold tabular ${rate >= 0 ? 'text-rose-600' : 'text-blue-600'}`}>
            {formatPercent(rate)}
          </p>
          <p className="text-xs text-muted tabular">실현 {formatPnl(pnl)}</p>
        </div>
      </div>
    </div>
  )
}
