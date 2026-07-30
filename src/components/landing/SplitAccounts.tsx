// 주식/코인 계좌 완전 분리 정책을 듀얼 액센트로 대비시키는 랜딩 섹션
import type { ReactNode } from 'react'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Chart, Coin } from '../ui/icons'

export function SplitAccounts() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>계좌 분리 설계</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">
            주식과 코인,
            <br className="sm:hidden" /> 섞지 않는다
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            거래 시간도, 가격 단위도, 변동성도 다른 두 자산을 하나의 계좌로 묶으면 평가 시점이
            모호해지고 실력 비교가 흐려집니다. 그래서 두 계좌를 구조적으로 분리했습니다.
          </p>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-[1fr_auto_1fr]">
          <Reveal>
            <Card accent="brand" className="lift h-full">
              <MarketPanel
                icon={<Chart width={20} height={20} />}
                color="text-brand"
                bg="bg-brand-soft"
                dot="bg-brand"
                title="주식 계좌"
                seed="1,000만원"
                traits={['평일 09:00–15:30 거래', '1주 단위 정수 주문', '과거 거래일 1분봉 재생']}
              />
            </Card>
          </Reveal>

          {/* 분리 구분자 */}
          <Reveal delay={100} className="flex items-center justify-center">
            {/* 위아래 세로선 사이에 pill 을 두어 두 카드의 세로 중앙에 걸리게 한다 */}
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="hidden h-20 w-px bg-gradient-to-b from-transparent to-line md:block" />
              <span className="whitespace-nowrap rounded-full border border-line bg-elevated px-4 py-2 text-xs font-medium text-muted shadow-soft-sm">
                이체 불가
              </span>
              <div className="hidden h-20 w-px bg-gradient-to-b from-line to-transparent md:block" />
            </div>
          </Reveal>

          <Reveal delay={160}>
            <Card accent="coin" className="lift h-full">
              <MarketPanel
                icon={<Coin width={20} height={20} />}
                color="text-coin"
                bg="bg-coin-soft"
                dot="bg-coin"
                title="코인 계좌"
                seed="1,000만원"
                traits={['24시간 365일 거래', '0.001 같은 소수점 주문', '빗썸 실시간 시세 연동']}
              />
            </Card>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <p className="mt-8 text-center text-sm text-muted">
            각 계좌는 독립된 현금·보유자산·거래내역을 가지며,{' '}
            <span className="font-medium text-ink">평가손익도 시장별로 따로</span> 계산됩니다.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function MarketPanel({
  icon,
  color,
  bg,
  dot,
  title,
  seed,
  traits,
}: {
  icon: ReactNode
  color: string
  bg: string
  dot: string
  title: string
  seed: string
  traits: string[]
}) {
  return (
    <div className="flex h-full flex-col p-7">
      <div className="flex items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${bg} ${color}`}>
          {icon}
        </span>
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-muted">
          시드 {seed}
        </span>
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold text-ink">{title}</h3>
      <ul className="mt-5 space-y-2.5">
        {traits.map((t) => (
          <li key={t} className="flex items-center gap-2.5 text-sm text-ink/80">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}
