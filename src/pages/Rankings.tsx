// 랭킹 페이지 — 주식/코인 탭, 상위 3 하이라이트, 실현손익 순위표, 내 순위, 순위 함정 안내
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Tabs } from '../components/ui/Tabs'
import { LinkButton } from '../components/ui/Button'
import { Trophy, Sparkle } from '../components/ui/icons'
import { rankingService } from '../services/rankingService'
import { useAuth } from '../auth/AuthContext'
import type { Market, RankingRow } from '../services/types'
import { formatPercent, formatPnl } from '../lib/format'

export function Rankings() {
  const { user, isAuthenticated } = useAuth()
  const [market, setMarket] = useState<Market>('STOCK')
  const [rows, setRows] = useState<RankingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    rankingService.getRankings(market).then((data) => {
      if (alive) {
        setRows(data)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [market])

  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)
  const myRow = user ? rows.find((r) => r.nickname === user.nickname) ?? null : null

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Eyebrow>실시간 순위</Eyebrow>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight md:text-5xl">랭킹</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">수익률(%)</span> 기준입니다. 튜토리얼 보상으로
            원금이 서로 달라도 공정하게 비교되며, 매일 00:00 스냅샷으로 갱신되고 주식·코인은 각각
            산정됩니다.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Tabs
            items={[
              { value: 'STOCK', label: '주식 랭킹' },
              { value: 'CRYPTO', label: '코인 랭킹' },
            ]}
            value={market}
            onChange={(v) => setMarket(v as Market)}
          />
        </div>

        {loading ? (
          <div className="mt-16 text-center text-sm text-muted">불러오는 중…</div>
        ) : (
          <>
            {/* 상위 3 하이라이트 */}
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {top3.map((row, i) => (
                <Card key={row.accountId} accent={i === 0 ? 'brand' : 'none'} className={i === 0 ? 'sm:-mt-3' : ''}>
                  <div className="p-6 text-center">
                    <span
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-full font-display text-lg font-bold ${
                        i === 0
                          ? 'bg-amber-100 text-amber-600'
                          : i === 1
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-orange-100 text-orange-500'
                      }`}
                    >
                      {row.rank}
                    </span>
                    <p className="mt-4 font-semibold">{row.nickname}</p>
                    <p className={`mt-2 font-display text-2xl font-semibold tabular ${row.returnRate >= 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                      {formatPercent(row.returnRate)}
                    </p>
                    <p className="mt-1 text-xs text-muted tabular">
                      실현 {formatPnl(row.realizedPnl)} · 거래 {row.tradeCount}회
                    </p>
                  </div>
                </Card>
              ))}
            </div>

            {/* 내 순위 */}
            {isAuthenticated && myRow && (
              <div className="mt-6">
                <MyRankRow row={myRow} />
              </div>
            )}

            {/* 나머지 순위표 */}
            <Card className="mt-6">
              <div className="divide-y divide-line">
                <div className="hidden grid-cols-12 gap-4 px-6 py-4 text-xs font-medium uppercase tracking-eyebrow text-muted sm:grid">
                  <span className="col-span-1">순위</span>
                  <span className="col-span-4">닉네임</span>
                  <span className="col-span-3 text-right">실현손익</span>
                  <span className="col-span-2 text-right">수익률</span>
                  <span className="col-span-2 text-right">평균보유</span>
                </div>
                {rest.map((row) => (
                  <RankRow key={row.accountId} row={row} highlight={row.nickname === user?.nickname} />
                ))}
              </div>
            </Card>

            {/* 순위의 함정 안내 */}
            <div className="mt-10">
              <Card accent="brand">
                <div className="flex flex-col gap-5 p-7 md:flex-row md:items-center">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    <Sparkle width={22} height={22} />
                  </span>
                  <div className="flex-1">
                    <h3 className="font-semibold">순위가 곧 좋은 투자자를 뜻하진 않습니다</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      랭킹은 실현손익만 봅니다. 하지만 AI 리포트는 미실현 손실까지 포함해 분석하므로,
                      상위 유저도 손절 회피 패턴을 지적받을 수 있습니다. 표의{' '}
                      <span className="font-medium text-ink">미실현 손익</span> 열을 함께 보세요.
                    </p>
                  </div>
                  {!isAuthenticated && (
                    <LinkButton to="/signup" withIcon className="flex-none">
                      내 순위 만들기
                    </LinkButton>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RankRow({ row, highlight }: { row: RankingRow; highlight?: boolean }) {
  return (
    <div
      className={`grid grid-cols-2 items-center gap-2 px-6 py-4 sm:grid-cols-12 sm:gap-4 ${
        highlight ? 'bg-brand-soft/50' : ''
      }`}
    >
      <span className="order-1 col-span-1 flex items-center gap-2">
        <span className="font-display text-lg font-semibold text-muted tabular">{row.rank}</span>
      </span>
      <span className="order-2 col-span-4 font-medium">
        {row.nickname}
        {highlight && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">나</span>}
      </span>
      <span
        className={`order-3 col-span-3 text-right font-display font-semibold tabular ${
          row.realizedPnl >= 0 ? 'text-rose-600' : 'text-blue-600'
        }`}
      >
        {formatPnl(row.realizedPnl)}
      </span>
      <span className="order-5 col-span-2 text-right text-sm tabular sm:order-4">
        {formatPercent(row.returnRate)}
      </span>
      <span className="order-4 col-span-2 text-right text-sm text-muted tabular sm:order-5">
        {row.avgHoldingDays}일
        <span className="ml-2 hidden text-xs text-muted/70 lg:inline">
          (미실현 {formatPnl(row.unrealizedPnl)})
        </span>
      </span>
    </div>
  )
}

function MyRankRow({ row }: { row: RankingRow }) {
  return (
    <Card accent="brand">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white">
            <Trophy width={20} height={20} />
          </span>
          <div>
            <p className="text-xs text-muted">내 순위</p>
            <p className="font-display text-2xl font-semibold tabular">{row.rank}위</p>
          </div>
        </div>
        <div className="h-10 w-px bg-line" />
        <Stat label="실현손익" value={formatPnl(row.realizedPnl)} tone={row.realizedPnl >= 0} />
        <Stat label="수익률" value={formatPercent(row.returnRate)} tone={row.returnRate >= 0} />
        <Stat label="미실현" value={formatPnl(row.unrealizedPnl)} tone={row.unrealizedPnl >= 0} muted />
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: string
  tone: boolean
  muted?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`font-display text-lg font-semibold tabular ${
          muted ? 'text-muted' : tone ? 'text-rose-600' : 'text-blue-600'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
