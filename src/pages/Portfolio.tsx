// 시장(주식/코인)별 계좌 요약·보유 종목·미체결 지정가·체결 내역(커서 페이징)을 보여주는 포트폴리오 화면
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import { formatDateTime, ratioToPercent } from '../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'
import { sideLabels } from '../lib/labels'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { getTrades } from '../services/tradeService'
import { getJournals } from '../services/journalService'
import { PendingOrders } from '../components/trade/PendingOrders'
import { bumpAccount } from '../lib/accountPulse'
import { PostSellFeedback } from '../components/feedback/PostSellFeedback'
import { JournalEditor } from '../components/journal/JournalEditor'
import type { AccountSummary, Holding, JournalListItem, Market, OrderSide, Trade } from '../services/types'

const JOURNAL_PREVIEW_SIZE = 3

const TRADE_PAGE_SIZE = 20
/** 코인은 분 tick 이 없어 자체 주기로 계좌를 다시 읽는다. */
const CRYPTO_ACCOUNT_REFRESH_MS = 15_000

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
  const [market, setMarket] = useState<Market>('CRYPTO')
  const isCrypto = market === 'CRYPTO'

  // 코인 탭에서는 주식 SSE 를 붙잡아 둘 이유가 없다.
  const { marketStatus, sourceTradingDate, lastMessageAt } = useStockStream({ enabled: !isCrypto })
  const { index } = useInstruments()

  const [refreshNonce, setRefreshNonce] = useState(0)
  /** 복기를 펼친 체결 id. 한 번에 하나만 연다 — 여러 개를 열면 post-sell 요청이 동시에 쌓인다. */
  const [openTradeId, setOpenTradeId] = useState<number | null>(null)
  /** 회고 작성 폼을 연 체결 id. 목록에 회고 유무가 없어 작성/수정을 미리 알 수 없다. */
  const [journalTradeId, setJournalTradeId] = useState<number | null>(null)

  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  // 평가 금액은 서버가 조회 시점 시세로 계산한다. 스트림 분이 넘어갈 때 다시 읽어 재생 시세를 따라간다.
  // 클라이언트가 스트림 가격으로 평가액을 다시 계산하면 서버의 시세 유효기간 정책과 어긋난다.
  const minuteTick = Math.floor((lastMessageAt ?? 0) / 60_000)

  const [cryptoTick, setCryptoTick] = useState(0)
  useEffect(() => {
    if (!isCrypto) return
    const timer = setInterval(() => setCryptoTick((n) => n + 1), CRYPTO_ACCOUNT_REFRESH_MS)
    return () => clearInterval(timer)
  }, [isCrypto])

  // 두 계좌는 완전히 분리돼 있다. 새 응답이 오기 전까지 앞 시장의 잔고·보유·체결을 그대로 두면 안 된다.
  useEffect(() => {
    setAccount(null)
    setHoldings(null)
    setAccountError(null)
    setTrades([])
    setTradesLoaded(false)
    setNextCursor(null)
    setHasNext(false)
  }, [market])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [summary, list] = await Promise.all([getAccountSummary(market), getHoldings(market)])
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
  }, [market, minuteTick, cryptoTick, refreshNonce])

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
        const page = await getTrades({ market, limit: TRADE_PAGE_SIZE })
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
  }, [market, refreshNonce])

  const loadMoreTrades = useCallback(async () => {
    if (!nextCursor || tradesLoading) return
    setTradesLoading(true)
    try {
      const page = await getTrades({
        market,
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
  }, [market, nextCursor, tradesLoading])

  const instrumentName = useCallback(
    (instrumentId: number) => index?.byId.get(instrumentId)?.name ?? `#${instrumentId}`,
    [index],
  )

  /**
   * 최근 투자일기 몇 개만 간략히 보여준다 — 전체 목록은 /journal 이 정본이다("전체보기").
   * 종목명은 이미 받아 둔 `trades`(최신 20건)에서 찾는다. 목록 항목엔 종목 정보가 없고
   * (spec 007 설계) 미리보기는 최근 몇 건뿐이라 최신 체결 페이지 안에 거의 항상 걸린다 —
   * 못 찾으면 "—"로 둔다(전체보기에서는 전 페이지를 훑어 정확히 맞춘다).
   */
  const [journalPreview, setJournalPreview] = useState<JournalListItem[] | null>(null)
  const [journalPreviewError, setJournalPreviewError] = useState<string | null>(null)
  const [journalPreviewNonce, setJournalPreviewNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setJournalPreview(null)
    setJournalPreviewError(null)
    getJournals({ market, limit: JOURNAL_PREVIEW_SIZE })
      .then((page) => {
        if (!cancelled) setJournalPreview(page.content)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 계좌 없음은 이 화면에서 이미 위쪽 계좌 요약 카드가 알린다 — 미리보기까지 또 에러로 띄우지 않고 빈 상태로 둔다.
        if (isApiErrorCode(e, 'NOT_FOUND')) {
          setJournalPreview([])
          return
        }
        setJournalPreviewError(toUserMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [market, journalPreviewNonce])

  const holdingsEmpty = holdings !== null && holdings.length === 0
  const marketLine = useMemo(() => {
    if (isCrypto) return '24시간 거래 · 빗썸 실시세 기준 평가'
    const status =
      marketStatus === 'OPEN' ? '장 운영 중' : marketStatus === 'CLOSED' ? '장 마감' : '장 상태 확인 중'
    return sourceTradingDate
      ? `${status} · ${sourceTradingDate} 장 재생 중`
      : `${status} · 재생할 거래일이 아직 준비되지 않았습니다`
  }, [isCrypto, marketStatus, sourceTradingDate])

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 right-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-5xl">
        {/* 1. 헤더 */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>포트폴리오</Eyebrow>
            <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
              {isCrypto ? '내 코인 계좌' : '내 주식 계좌'}
            </h1>
            <MarketTabs market={market} onChange={setMarket} className="mt-5" />
            <p className="mt-3 text-sm text-muted">{marketLine}</p>
          </div>
          <Button variant="ghost" onClick={() => setRefreshNonce((n) => n + 1)}>
            새로고침
          </Button>
        </header>

        {/* 2. 계좌 요약 */}
        <Card className="mt-8" accent={isCrypto ? 'coin' : 'brand'} innerClassName="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-ink">
            계좌 요약 · 주식과 코인 계좌는 완전히 분리됩니다
          </h2>
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
                              {/*
                                예약 수량을 알리지 않으면 사용자가 전량 매도를 시도해 409 를 맞는다.
                                서버는 availableQuantity 를 주지 않아 직접 빼서 보여줘야 한다.
                              */}
                              {holding.reservedQuantity > 0 && (
                                <span className="mt-0.5 block text-[10px] font-normal text-coin">
                                  예약 {formatQty(holding.reservedQuantity)} · 매도가능{' '}
                                  {formatQty(holding.quantity - holding.reservedQuantity)}
                                </span>
                              )}
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

        {/*
          4. 미체결 지정가 — 보유(가진 것)와 체결(끝난 것) 사이가 "진행 중인 것"의 자리다.
          주식 지정가는 백엔드에 없어 코인 탭에서만 보여준다.
        */}
        {isCrypto && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold text-ink">미체결 주문</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              지정가로 접수했지만 아직 체결되지 않은 주문입니다. 여기서 가격·수량을 정정하거나
              취소할 수 있습니다.
            </p>
            <div className="mt-5">
              <PendingOrders
                market={market}
                refreshNonce={refreshNonce}
                onChanged={() => {
                  // 예약분 변화가 응답에 실려 오지 않아 계좌·보유를 다시 읽어야 한다.
                  setRefreshNonce((n) => n + 1)
                  bumpAccount()
                }}
              />
            </div>
          </section>
        )}

        {/* 5. 체결 내역 */}
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
                    <th className="px-4 py-3 text-right font-medium">복기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted">
                        {tradesLoaded ? '아직 체결된 거래가 없습니다.' : '체결 내역을 불러오는 중입니다.'}
                      </td>
                    </tr>
                  ) : (
                    trades.map((trade) => (
                      <Fragment key={trade.tradeId}>
                      <tr>
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
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOpenTradeId(openTradeId === trade.tradeId ? null : trade.tradeId)
                              setJournalTradeId(null)
                            }}
                          >
                            {openTradeId === trade.tradeId ? '접기' : '보기'}
                          </Button>
                        </td>
                      </tr>

                      {openTradeId === trade.tradeId && (
                        <tr>
                          <td colSpan={9} className="bg-canvas/40 px-4 py-5">
                            <div className="space-y-4">
                              {/*
                                매도 직후 피드백은 2차에서 주식 전용이라 코인 체결에는 부르지 않는다
                                (부르면 400 이 온다). 매수 체결도 대상이 아니다.
                              */}
                              {trade.side === 'SELL' && !isCrypto && (
                                <PostSellFeedback tradeId={trade.tradeId} />
                              )}

                              {/*
                                투자일기 작성 진입점. GET /api/journal 은 이미 쓴 회고만 돌려주므로
                                아직 안 쓴 체결은 이 자리에서만 시작할 수 있다.
                                작성인지 수정인지 목록만으로는 알 수 없어 먼저 작성으로 시도하고,
                                409 면 에디터가 "이미 있다"고 알린다(임의로 덮어쓰지 않는다).
                              */}
                              {journalTradeId === trade.tradeId ? (
                                <JournalEditor
                                  journalType={trade.side === 'BUY' ? 'BUY' : 'SELL'}
                                  tradeId={trade.tradeId}
                                  mode="create"
                                  onSaved={() => {
                                    setJournalTradeId(null)
                                    setJournalPreviewNonce((n) => n + 1)
                                  }}
                                  onCancel={() => setJournalTradeId(null)}
                                />
                              ) : (
                                <div className="flex flex-wrap items-center gap-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setJournalTradeId(trade.tradeId)}
                                  >
                                    {trade.side === 'BUY' ? '매수 일기 쓰기' : '매도 회고 쓰기'}
                                  </Button>
                                  <LinkButton to="/journal" variant="ghost" size="sm">
                                    내 투자일기
                                  </LinkButton>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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

        {/* 6. 투자일기 미리보기 — 전체 목록·수정은 /journal 이 정본이다 */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">투자일기</h2>
          {/* 설명과 전체보기를 한 줄에 둬야 "이 목록의 전체 보기"라는 게 한눈에 이어진다. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">최근 남긴 회고만 간단히 보여줍니다.</p>
            <LinkButton to="/journal" variant="ghost" size="sm">
              전체보기
            </LinkButton>
          </div>

          <div className="mt-4 space-y-3">
            {journalPreview === null && !journalPreviewError && (
              <Card innerClassName="p-5">
                <div className="skeleton h-3 w-24" />
                <div className="mt-3 skeleton h-3 w-full" />
              </Card>
            )}

            {journalPreviewError && <p className="text-sm text-loss">{journalPreviewError}</p>}

            {journalPreview !== null && journalPreview.length === 0 && (
              <Card innerClassName="p-6 text-center text-sm text-muted">
                아직 작성한 투자일기가 없습니다.
              </Card>
            )}

            {journalPreview?.map((item) => {
              const tradeId = item.journalType === 'BUY' ? item.buyTradeId : item.sellTradeId
              // 최근 몇 건뿐이라 최신 체결 페이지(trades) 안에서 거의 항상 찾는다 — 못 찾으면 "—".
              const instrumentId = trades.find((t) => t.tradeId === tradeId)?.instrumentId
              return (
                <Card key={`${item.journalType}-${tradeId}`} innerClassName="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        item.journalType === 'BUY' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {sideLabels[item.journalType]}
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {instrumentId !== undefined ? instrumentName(instrumentId) : '—'}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                    {item.content}
                  </p>
                </Card>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
