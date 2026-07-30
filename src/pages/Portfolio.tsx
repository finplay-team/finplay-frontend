// 주식 계좌 요약·보유 종목·체결 내역(커서 페이징)을 보여주는 포트폴리오 화면
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import { formatDateTime, ratioToPercent } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'
import { sideLabels } from '../lib/labels'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { getTrades } from '../services/tradeService'
import type { AccountSummary, Holding, OrderSide, Trade } from '../services/types'

const TRADE_PAGE_SIZE = 20

/** 부호를 붙인 정확한 원화 금액. formatPnl 은 만 단위로 축약해 표의 손익 표시에는 쓸 수 없다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

/** 10.00000000 처럼 scale 이 붙어 오는 수량을 불필요한 0 없이 표시한다. */
function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

function Stat({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular ${tone}`}>{value}</dd>
    </div>
  )
}

function SideChip({ side }: { side: OrderSide }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
        side === 'BUY' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
      }`}
    >
      {sideLabels[side]}
    </span>
  )
}

export function Portfolio() {
  const { marketStatus, sourceTradingDate, lastMessageAt } = useStockStream()
  const { index } = useInstruments()

  const [refreshNonce, setRefreshNonce] = useState(0)

  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  // 평가 금액은 서버가 조회 시점 시세로 계산한다. 스트림 분이 넘어갈 때 다시 읽어 재생 시세를 따라간다.
  // 클라이언트가 스트림 가격으로 평가액을 다시 계산하면 서버의 시세 유효기간 정책과 어긋난다.
  const minuteTick = Math.floor((lastMessageAt ?? 0) / 60_000)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [summary, list] = await Promise.all([
          getAccountSummary('STOCK'),
          getHoldings('STOCK'),
        ])
        if (cancelled) return
        setAccount(summary)
        setHoldings(list)
        setAccountError(null)
      } catch (e) {
        if (!cancelled) setAccountError(toUserMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [minuteTick, refreshNonce])

  const [trades, setTrades] = useState<Trade[]>([])
  const [tradesLoaded, setTradesLoaded] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [tradesLoading, setTradesLoading] = useState(false)
  const [tradesError, setTradesError] = useState<string | null>(null)

  // 체결 내역은 분 tick 으로 되감지 않는다. 더보기로 펼친 페이지가 사라지면 안 된다.
  useEffect(() => {
    let cancelled = false
    setTradesLoading(true)
    void (async () => {
      try {
        const page = await getTrades({ market: 'STOCK', limit: TRADE_PAGE_SIZE })
        if (cancelled) return
        setTrades(page.content)
        setNextCursor(page.nextCursor)
        setHasNext(page.hasNext)
        setTradesError(null)
      } catch (e) {
        if (!cancelled) setTradesError(toUserMessage(e))
      } finally {
        if (!cancelled) {
          setTradesLoading(false)
          setTradesLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  const loadMoreTrades = useCallback(async () => {
    if (!nextCursor || tradesLoading) return
    setTradesLoading(true)
    try {
      const page = await getTrades({
        market: 'STOCK',
        cursor: nextCursor,
        limit: TRADE_PAGE_SIZE,
      })
      setTrades((prev) => [...prev, ...page.content])
      setNextCursor(page.nextCursor)
      setHasNext(page.hasNext)
      setTradesError(null)
    } catch (e) {
      setTradesError(toUserMessage(e))
    } finally {
      setTradesLoading(false)
    }
  }, [nextCursor, tradesLoading])

  const instrumentName = useCallback(
    (instrumentId: number) => index?.byId.get(instrumentId)?.name ?? `#${instrumentId}`,
    [index],
  )

  const holdingsEmpty = holdings !== null && holdings.length === 0
  const marketLine = useMemo(() => {
    const status =
      marketStatus === 'OPEN' ? '장 운영 중' : marketStatus === 'CLOSED' ? '장 마감' : '장 상태 확인 중'
    return sourceTradingDate
      ? `${status} · ${sourceTradingDate} 장 재생 중`
      : `${status} · 재생할 거래일이 아직 준비되지 않았습니다`
  }, [marketStatus, sourceTradingDate])

  return (
    <div className="relative min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 right-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-5xl">
        {/* 1. 헤더 */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>포트폴리오</Eyebrow>
            <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
              내 주식 계좌
            </h1>
            <p className="mt-3 text-sm text-muted">{marketLine}</p>
          </div>
          <Button variant="ghost" onClick={() => setRefreshNonce((n) => n + 1)}>
            새로고침
          </Button>
        </header>

        {/* 2. 계좌 요약 */}
        <Card className="mt-8" accent="brand" innerClassName="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-ink">계좌 요약</h2>
          {accountError ? (
            <p className="mt-4 text-sm text-loss">{accountError}</p>
          ) : (
            <dl className="mt-5 grid grid-cols-2 gap-6 md:grid-cols-3">
              <Stat label="총 평가자산" value={account ? formatKRW(account.totalValue) : '—'} />
              <Stat label="주문가능 현금" value={account ? formatKRW(account.cashBalance) : '—'} />
              <Stat
                label="보유 평가금액"
                value={account ? formatKRW(account.holdingsValue) : '—'}
              />
              <Stat
                label="실현손익"
                value={account ? signedKRW(account.realizedPnl) : '—'}
                tone={account ? pnlTone(account.realizedPnl) : 'text-ink'}
              />
              <Stat
                label="평가손익"
                value={account ? signedKRW(account.unrealizedPnl) : '—'}
                tone={account ? pnlTone(account.unrealizedPnl) : 'text-ink'}
              />
              <Stat
                label="수익률"
                value={account ? formatPercent(ratioToPercent(account.returnRate)) : '—'}
                tone={account ? pnlTone(account.returnRate) : 'text-ink'}
              />
            </dl>
          )}
        </Card>

        {/* 3. 보유 종목 */}
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-ink">보유 종목</h2>

          {holdingsEmpty ? (
            <Card className="mt-5" innerClassName="p-8 text-center">
              <p className="text-sm text-muted">아직 보유한 종목이 없습니다.</p>
              <div className="mt-5 flex justify-center">
                <LinkButton to="/trade" withIcon>
                  거래 시작하기
                </LinkButton>
              </div>
            </Card>
          ) : (
            <Card className="mt-5" innerClassName="p-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="px-4 py-3 text-left font-medium">종목</th>
                      <th className="px-4 py-3 text-right font-medium">수량</th>
                      <th className="px-4 py-3 text-right font-medium">평균단가</th>
                      <th className="px-4 py-3 text-right font-medium">현재가</th>
                      <th className="px-4 py-3 text-right font-medium">평가금액</th>
                      <th className="px-4 py-3 text-right font-medium">평가손익</th>
                      <th className="px-4 py-3 text-right font-medium">수익률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {holdings === null ? (
                      <tr>
                        <td
                          colSpan={7}
                          className={`px-4 py-8 text-center ${accountError ? 'text-loss' : 'text-muted'}`}
                        >
                          {accountError ?? '보유 종목을 불러오는 중입니다.'}
                        </td>
                      </tr>
                    ) : (
                      holdings.map((holding) => {
                        // UNAVAILABLE 이면 평가 관련 4개 필드가 명시적 null 이다. 0 으로 바꾸면 −100% 로 보인다.
                        const unavailable = holding.priceStatus === 'UNAVAILABLE'
                        return (
                          <tr key={holding.instrumentId}>
                            <td className="px-4 py-3">
                              <span className="block font-medium text-ink">{holding.name}</span>
                              <span className="mt-0.5 block text-xs text-muted tabular">
                                {holding.symbol}
                              </span>
                              {unavailable && (
                                <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted">
                                  시세 없음 · 평가액 계산 불가
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-ink tabular">
                              {formatQty(holding.quantity)}
                            </td>
                            <td className="px-4 py-3 text-right text-ink tabular">
                              {formatKRW(holding.averagePrice)}
                            </td>
                            <td className="px-4 py-3 text-right text-ink tabular">
                              {holding.currentPrice === null ? '—' : formatKRW(holding.currentPrice)}
                            </td>
                            <td className="px-4 py-3 text-right text-ink tabular">
                              {holding.evaluationAmount === null
                                ? '—'
                                : formatKRW(holding.evaluationAmount)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right tabular ${
                                holding.unrealizedPnl === null
                                  ? 'text-muted'
                                  : pnlTone(holding.unrealizedPnl)
                              }`}
                            >
                              {holding.unrealizedPnl === null
                                ? '—'
                                : signedKRW(holding.unrealizedPnl)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right tabular ${
                                holding.returnRate === null ? 'text-muted' : pnlTone(holding.returnRate)
                              }`}
                            >
                              {holding.returnRate === null
                                ? '—'
                                : formatPercent(ratioToPercent(holding.returnRate))}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>

        {/* 4. 체결 내역 */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">체결 내역</h2>
          <p className="mt-2 text-sm text-muted">
            시장가 주문은 즉시 체결되므로 미체결 주문은 존재하지 않습니다. 수수료는 서버가 계산한
            실제 금액입니다.
          </p>

          <Card className="mt-5" innerClassName="p-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-4 py-3 text-left font-medium">체결시각</th>
                    <th className="px-4 py-3 text-left font-medium">구분</th>
                    <th className="px-4 py-3 text-left font-medium">종목</th>
                    <th className="px-4 py-3 text-right font-medium">단가</th>
                    <th className="px-4 py-3 text-right font-medium">수량</th>
                    <th className="px-4 py-3 text-right font-medium">거래금액</th>
                    <th className="px-4 py-3 text-right font-medium">수수료</th>
                    <th className="px-4 py-3 text-right font-medium">실현손익</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted">
                        {tradesLoaded ? '아직 체결된 거래가 없습니다.' : '체결 내역을 불러오는 중입니다.'}
                      </td>
                    </tr>
                  ) : (
                    trades.map((trade) => (
                      <tr key={trade.tradeId}>
                        <td className="px-4 py-3 text-muted tabular">
                          {formatDateTime(trade.executedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <SideChip side={trade.side} />
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {instrumentName(trade.instrumentId)}
                        </td>
                        <td className="px-4 py-3 text-right text-ink tabular">
                          {formatKRW(trade.price)}
                        </td>
                        <td className="px-4 py-3 text-right text-ink tabular">
                          {formatQty(trade.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right text-ink tabular">
                          {formatKRW(trade.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted tabular">
                          {formatKRW(trade.fee)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular ${
                            trade.realizedPnl === null ? 'text-muted' : pnlTone(trade.realizedPnl)
                          }`}
                        >
                          {trade.realizedPnl === null ? '—' : signedKRW(trade.realizedPnl)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {tradesError && <p className="mt-3 text-sm text-loss">{tradesError}</p>}

          {hasNext && (
            <div className="mt-5 flex justify-center">
              <Button variant="soft" onClick={loadMoreTrades} disabled={tradesLoading}>
                {tradesLoading ? '불러오는 중' : '더보기'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
