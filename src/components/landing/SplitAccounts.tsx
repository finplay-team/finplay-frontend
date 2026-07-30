// 주식/코인 계좌 완전 분리 정책을 듀얼 액센트로 대비시키는 섹션
import type { ReactNode } from 'react'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Chart, Coin } from '../ui/icons'

export function SplitAccounts() {
  return (
    <section className="px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>계좌 분리 설계</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            주식과 코인,
            <br className="sm:hidden" /> 섞지 않는다
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            거래 시간도, 가격 단위도, 변동성도 다른 두 자산을 하나의 계좌로 묶으면 평가 시점이
            모호해지고 실력 비교가 흐려집니다. 그래서 두 계좌를 구조적으로 분리했습니다.
          </p>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-5 md:grid-cols-[1fr_auto_1fr]">
          <Reveal>
            <Card accent="stock" className="h-full">
              <MarketPanel
                icon={<Chart width={20} height={20} />}
                color="text-stock"
                bg="bg-stock/10"
                dot="bg-stock"
                title="주식 계좌"
                seed="1,000만원"
                traits={['평일 09:00–15:30 거래', '가격대별 호가 단위', '시세 공급자 추상화 대응']}
              />
            </Card>
          </Reveal>

          {/* 분리 구분자 */}
          <Reveal delay={100} className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 py-4">
              <span className="rounded-full border border-line bg-white px-4 py-2 text-xs font-medium text-muted shadow-soft-sm">
                이체 불가
              </span>
              <div className="hidden h-24 w-px bg-line md:block" />
            </div>
          </Reveal>

          <Reveal delay={160}>
            <Card accent="coin" className="h-full">
              <MarketPanel
                icon={<Coin width={20} height={20} />}
                color="text-coin"
                bg="bg-coin/15"
                dot="bg-coin"
                title="코인 계좌"
                seed="1,000만원"
                traits={['24시간 365일 거래', '소수점 단위 매매', '업비트 실시간 시세 연동']}
              />
            </Card>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <p className="mt-8 text-center text-sm text-muted">
            각 계좌는 독립된 현금·보유자산·거래내역을 가지며,{' '}
            <span className="font-medium text-ink">랭킹도 주식·코인 따로</span> 산정됩니다.
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
        <span className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] text-muted">
          시드 {seed}
        </span>
      </div>
      <h3 className="mt-5 font-display text-2xl font-semibold">{title}</h3>
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
