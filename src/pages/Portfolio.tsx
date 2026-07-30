// 로그인 사용자의 주식/코인 포트폴리오·보유·거래내역·미체결·투자일기 페이지
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Tabs } from '../components/ui/Tabs'
import { Button, LinkButton } from '../components/ui/Button'
import { Chart, Coin, Notebook, Sparkle } from '../components/ui/icons'
import { useAuth } from '../auth/AuthContext'
import { useLivePrices } from '../hooks/useLivePrices'
import { tradeService } from '../services/tradeService'
import type {
  DecisionLog,
  Market,
  OrderSide,
  PendingOrder,
  PortfolioSummary,
  Position,
  TradeRecord,
} from '../services/types'
import { basisLabels, sideLabels } from '../lib/labels'
import {
  formatDate,
  formatKRW,
  formatManEok,
  formatPercent,
  formatPnl,
  pnlTone,
} from '../lib/format'

/** 코인은 소수점 수량이 가능하므로 최대 8자리까지 표기 (뒤 0은 제거) */
function formatQty(quantity: number): string {
  return quantity.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

function SideChip({ side }: { side: OrderSide }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        side === 'BUY' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
      }`}
    >
      {sideLabels[side]}
    </span>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  )
}

export function Portfolio() {
  const { user } = useAuth()
  // 내정보 계좌 카드에서 넘어올 때 해당 시장 탭을 미리 선택
  const location = useLocation()
  const initialMarket = (location.state as { market?: Market } | null)?.market ?? 'STOCK'
  const [market, setMarket] = useState<Market>(initialMarket)
  const { version } = useLivePrices(market)

  // 라우트는 이미 로그인 가드가 걸려 있지만, 타입 안전을 위해 한 번 더 확인한다.
  const userId = user?.id ?? null
  const accountId = useMemo(
    () => (userId ? tradeService.getAccountId(userId, market) : null),
    [userId, market],
  )

  const summary = useMemo<PortfolioSummary | null>(
    () => (accountId ? tradeService.getSummarySync(accountId) : null),
    [accountId, version],
  )
  const positions = useMemo<Position[]>(
    () => (accountId ? tradeService.getPositionsSync(accountId) : []),
    [accountId, version],
  )

  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [pending, setPending] = useState<PendingOrder[]>([])
  const [logs, setLogs] = useState<DecisionLog[]>([])

  useEffect(() => {
    if (!accountId) {
      setTrades([])
      setPending([])
      setLogs([])
      return
    }
    let alive = true
    tradeService.getTrades(accountId).then((data) => {
      if (alive) setTrades(data)
    })
    tradeService.getPendingOrders(accountId).then((data) => {
      if (alive) setPending(data)
    })
    tradeService.getDecisionLogs(accountId).then((data) => {
      if (alive) setLogs(data)
    })
    return () => {
      alive = false
    }
  }, [accountId])

  const handleCancel = useCallback(async (orderId: string) => {
    await tradeService.cancelPending(orderId)
    setPending((prev) => prev.filter((o) => o.id !== orderId))
  }, [])

  const accent = market === 'STOCK' ? 'stock' : 'coin'
  const MarketIcon = market === 'STOCK' ? Chart : Coin

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Eyebrow>내 자산</Eyebrow>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight md:text-5xl">
            포트폴리오
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
            주식과 코인 계좌는 서로 분리되어 있습니다. 보유 종목의 실시간 평가와 거래내역,
            투자일기를 한곳에서 확인하세요.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Tabs
            items={[
              { value: 'STOCK', label: '주식' },
              { value: 'CRYPTO', label: '코인' },
            ]}
            value={market}
            onChange={(v) => setMarket(v as Market)}
          />
        </div>

        {!user ? (
          <Card className="mt-12">
            <div className="p-10 text-center text-sm text-muted">로그인이 필요합니다.</div>
          </Card>
        ) : !accountId || !summary ? (
          <Card className="mt-12" accent={accent}>
            <div className="flex flex-col items-center gap-4 p-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <MarketIcon width={22} height={22} />
              </span>
              <p className="text-sm text-muted">
                아직 {market === 'STOCK' ? '주식' : '코인'} 계좌가 없습니다. 거래를 시작하면
                포트폴리오가 만들어집니다.
              </p>
              <LinkButton to="/trade" withIcon>
                거래 시작하기
              </LinkButton>
            </div>
          </Card>
        ) : (
          <>
            {/* 계좌 요약 */}
            <div className="mt-10">
              <Card accent={accent}>
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft ${
                        market === 'STOCK' ? 'text-stock' : 'text-coin'
                      }`}
                    >
                      <MarketIcon width={20} height={20} />
                    </span>
                    <div>
                      <p className="text-xs text-muted">
                        {market === 'STOCK' ? '주식 계좌' : '코인 계좌'} 총 평가자산
                      </p>
                      <p className="font-display text-3xl font-bold tabular">
                        {formatManEok(summary.totalValue)}원
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                    <SummaryStat label="현금" value={formatKRW(summary.cashBalance)} />
                    <SummaryStat
                      label="평가손익"
                      value={formatPnl(summary.unrealizedPnl)}
                      tone={pnlTone(summary.unrealizedPnl)}
                    />
                    <SummaryStat
                      label="실현손익"
                      value={formatPnl(summary.realizedPnl)}
                      tone={pnlTone(summary.realizedPnl)}
                    />
                    <SummaryStat
                      label="수익률"
                      value={formatPercent(summary.returnRate)}
                      tone={pnlTone(summary.returnRate)}
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* 보유 종목 */}
            <section className="mt-10">
              <SectionHeading eyebrow="보유 현황" title="보유 종목" />
              <Card>
                {positions.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 p-10 text-center">
                    <p className="text-sm text-muted">보유 중인 종목이 없습니다.</p>
                    <LinkButton to="/trade" variant="soft" withIcon>
                      종목 둘러보기
                    </LinkButton>
                  </div>
                ) : (
                  <div className="divide-y divide-line">
                    {positions.map((p) => (
                      <div
                        key={p.instrument.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                      >
                        <div className="min-w-[9rem]">
                          <p className="font-medium">{p.instrument.name}</p>
                          <p className="text-xs text-muted">{p.instrument.symbol}</p>
                        </div>
                        <div className="text-right text-xs text-muted tabular">
                          <p>수량 {formatQty(p.quantity)}</p>
                          <p>평단 {formatKRW(p.avgPrice)}</p>
                        </div>
                        <div className="text-right text-xs text-muted tabular">
                          <p>현재가 {formatKRW(p.currentPrice)}</p>
                          <p>평가 {formatManEok(p.marketValue)}원</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-display font-semibold tabular ${pnlTone(p.unrealizedPnl)}`}>
                            {formatPnl(p.unrealizedPnl)}
                          </p>
                          <p className={`text-xs tabular ${pnlTone(p.unrealizedRate)}`}>
                            {formatPercent(p.unrealizedRate)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            {/* 미체결 주문 */}
            {pending.length > 0 && (
              <section className="mt-10">
                <SectionHeading eyebrow="대기 중" title="미체결 주문" />
                <Card>
                  <div className="divide-y divide-line">
                    {pending.map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                      >
                        <div className="flex items-center gap-3">
                          <SideChip side={o.side} />
                          <div>
                            <p className="font-medium">{o.instrumentName}</p>
                            <p className="text-xs text-muted tabular">
                              지정가 {formatKRW(o.limitPrice)} · 수량 {formatQty(o.quantity)}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" onClick={() => handleCancel(o.id)}>
                          취소
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}

            {/* 거래내역 */}
            <section className="mt-10">
              <SectionHeading eyebrow="체결 기록" title="거래내역" />
              <Card>
                {trades.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted">아직 거래내역이 없습니다.</div>
                ) : (
                  <div className="divide-y divide-line">
                    {trades.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                      >
                        <div className="flex items-center gap-3">
                          <SideChip side={t.side} />
                          <div>
                            <p className="font-medium">{t.instrumentName}</p>
                            <p className="text-xs text-muted">{formatDate(t.executedAt)}</p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted tabular">
                          <p>
                            {formatKRW(t.price)} × {formatQty(t.quantity)}
                          </p>
                          <p>수수료 {formatKRW(t.fee)}</p>
                        </div>
                        <div className="text-right font-display font-semibold tabular">
                          {formatManEok(t.amount)}원
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            {/* 투자일기 */}
            <section className="mt-10">
              <SectionHeading eyebrow="투자일기" title="매매 근거와 AI 복기" />
              <Card>
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                      <Notebook width={20} height={20} />
                    </span>
                    <p className="text-sm text-muted">
                      아직 작성한 투자일기가 없습니다. 주문할 때 매매 근거를 남겨보세요.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-line">
                    {logs.map((log) => (
                      <div key={log.id} className="px-6 py-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <SideChip side={log.side} />
                          <span className="font-medium">{log.instrumentName}</span>
                          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-muted">
                            {basisLabels[log.basis]}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-ink">{log.memo}</p>
                        {log.aiReview ? (
                          <div className="mt-4 rounded-2xl bg-brand-soft/60 p-4">
                            <div className="flex items-center gap-2 text-brand">
                              <Sparkle width={16} height={16} />
                              <span className="text-xs font-medium">AI 복기</span>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-ink">{log.aiReview}</p>
                          </div>
                        ) : (
                          <span className="mt-3 inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-muted">
                            AI 복기 대기중
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold tabular ${tone ?? 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}
