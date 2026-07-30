// 주식 시장가 매매 화면 — SSE 시세·분봉 차트·시장가 주문을 한 화면에서 처리한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CandleChart } from '../components/CandleChart'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { useCandles } from '../hooks/useCandles'
import { useIdempotencyKey } from '../hooks/useIdempotencyKey'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream, type StreamConnectionState } from '../hooks/useStockStream'
import { formatDateTime, formatHhMm, ratioToPercent } from '../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'
import { sideLabels } from '../lib/labels'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { placeOrder } from '../services/orderService'
import type {
  AccountSummary,
  Holding,
  Instrument,
  OrderExecutionResponse,
  OrderSide,
} from '../services/types'

/** 서버 heartbeat 가 20초 주기이므로 이보다 오래 조용하면 정체로 본다. */
const STALE_MS = 40_000

const streamStateLabels: Record<StreamConnectionState, string> = {
  idle: '시세 대기',
  connecting: '시세 연결 중',
  open: '실시간 수신',
  reconnecting: '재연결 중',
  closed: '시세 연결 종료',
}

/** 주문 실패 시 화면 문맥에 맞게 덮어쓰는 문구. 백엔드 message 는 쓰지 않고 code 로만 분기한다. */
const ORDER_ERROR_MESSAGES: Record<string, string> = {
  MARKET_CLOSED: '장 시간이 아닙니다 (09:00~15:30). 주문이 접수되지 않았습니다.',
  PRICE_UNAVAILABLE: '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.',
  INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다. 수량을 줄여 주세요.',
  INSUFFICIENT_QTY: '보유 수량이 부족합니다. 보유 수량을 다시 확인해 주세요.',
  IDEMPOTENCY_CONFLICT: '직전 주문과 요청이 충돌했습니다. 주문 내용을 확인하고 다시 시도해 주세요.',
  VALIDATION_ERROR: '주식은 1주 단위 정수만 주문할 수 있습니다. 수량을 확인해 주세요.',
  NOT_FOUND: '종목 또는 계좌를 찾을 수 없습니다.',
}

/** 부호를 붙인 정확한 원화 금액. formatPnl 은 만 단위로 축약해 체결 금액 표시에는 쓸 수 없다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

/** 10.00000000 처럼 scale 이 붙어 오는 수량을 불필요한 0 없이 표시한다. */
function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

function Pill({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
        active ? 'bg-brand-soft text-brand' : 'bg-white/[0.04] text-muted ring-1 ring-white/[0.08]'
      }`}
    >
      {children}
    </span>
  )
}

function Stat({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular ${tone}`}>{value}</dd>
    </div>
  )
}

export function Trade() {
  const {
    prices,
    marketStatus,
    sourceTradingDate,
    state: streamState,
    lastMessageAt,
    error: streamError,
  } = useStockStream()
  const { index, loading: instrumentsLoading, error: instrumentsError } = useInstruments()

  // 정체 판정용 시계. lastMessageAt 은 조용해지면 갱신되지 않으므로 별도 tick 이 필요하다.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  const stocks = useMemo<Instrument[]>(
    () =>
      index
        ? [...index.byId.values()]
            .filter((i) => i.market === 'STOCK')
            .sort((a, b) => a.instrumentId - b.instrumentId)
        : [],
    [index],
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  useEffect(() => {
    if (selectedId === null && stocks.length > 0) setSelectedId(stocks[0].instrumentId)
  }, [selectedId, stocks])

  const selected = selectedId === null ? null : (index?.byId.get(selectedId) ?? null)
  // 스트림은 instrumentId 가 아니라 symbol 로 키를 잡는다.
  const snapshot = selected ? prices[selected.symbol] : undefined
  const currentPrice = snapshot?.status === 'AVAILABLE' ? snapshot.price : null

  // 주식은 서버 분 크론에만 새 봉이 생긴다 → 분이 넘어갈 때만 재조회한다.
  const minuteTick = Math.floor((lastMessageAt ?? 0) / 60_000)
  const {
    candles,
    loading: candlesLoading,
    error: candlesError,
  } = useCandles({ instrumentId: selectedId, market: 'STOCK', minuteTick })

  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountNonce, setAccountNonce] = useState(0)

  // 잔고는 SSE 로 오지 않는다. 최초 1회 + 분이 넘어갈 때 + 주문 성공 직후에 직접 다시 읽는다.
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
  }, [minuteTick, accountNonce])

  const held = useMemo(() => {
    if (!holdings || !selected) return 0
    const holding = holdings.find((h) => h.instrumentId === selected.instrumentId)
    return holding ? Math.floor(holding.quantity) : 0
  }, [holdings, selected])

  const [side, setSide] = useState<OrderSide>('BUY')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [result, setResult] = useState<OrderExecutionResponse | null>(null)
  // 성공한 주문의 키를 그대로 재사용하면 서버가 같은 체결을 재생해 두 번째 주문이 조용히 삼켜진다.
  const [successNonce, setSuccessNonce] = useState(0)
  // disabled 상태만으로는 빠른 더블클릭이 두 핸들러를 모두 통과한다. 동기 플래그로 한 번 더 막는다.
  const submittingRef = useRef(false)

  const idempotencyKey = useIdempotencyKey([selectedId, side, quantity, successNonce])

  // 종목·매매구분이 바뀌면 앞선 체결 결과와 오류는 더 이상 이 주문의 것이 아니다.
  useEffect(() => {
    setResult(null)
    setOrderError(null)
  }, [selectedId, side])

  const quantityNumber = quantity === '' ? 0 : Number(quantity)
  const estimatedAmount =
    currentPrice !== null && quantityNumber > 0 ? currentPrice * quantityNumber : null

  const handleQuantityChange = (raw: string) => {
    // 주식 수량에 소수점이 있으면 백엔드가 400 VALIDATION_ERROR 를 낸다 → 입력 자체에서 막는다.
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    if (side === 'SELL' && held > 0 && digits !== '' && Number(digits) > held) {
      setQuantity(String(held))
      return
    }
    setQuantity(digits)
  }

  const disableReason = useMemo<string | null>(() => {
    if (!selected) return '주문할 종목을 선택해 주세요.'
    if (!selected.tradable) return '거래정지 종목입니다.'
    if (streamState !== 'open') return '시세 서버에 연결하는 중입니다. 잠시 후 다시 시도해 주세요.'
    if (marketStatus !== 'OPEN') return '장 시간이 아닙니다 (09:00~15:30).'
    if (!snapshot || snapshot.status === 'UNAVAILABLE' || snapshot.price === null)
      return '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.'
    if (quantityNumber <= 0) return '주문 수량을 1주 이상 입력해 주세요.'
    if (side === 'SELL' && held <= 0) return '보유한 수량이 없어 매도할 수 없습니다.'
    if (side === 'SELL' && quantityNumber > held) return `보유 수량이 부족합니다. (보유 ${held}주)`
    return null
  }, [held, marketStatus, quantityNumber, selected, side, snapshot, streamState])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      // 이 검사는 상태 커밋을 기다리지 않으므로 더블클릭의 두 번째 호출도 여기서 걸린다.
      if (submittingRef.current) return
      if (!selected || disableReason) return

      submittingRef.current = true
      setSubmitting(true)
      setOrderError(null)
      setResult(null)
      try {
        const execution = await placeOrder(
          {
            market: 'STOCK',
            instrumentId: selected.instrumentId,
            side,
            orderType: 'MARKET',
            quantity: String(quantityNumber),
          },
          idempotencyKey,
        )
        setResult(execution)
        setSuccessNonce((n) => n + 1)
        setAccountNonce((n) => n + 1) // 잔고·보유는 스트림이 아니라 직접 다시 읽어야 갱신된다
      } catch (e) {
        // 같은 본문 재시도는 키를 유지해야 서버가 원래 응답을 재생한다.
        // 충돌은 우리 키 관리가 어긋난 경우이므로 자동 재시도 없이 키만 회전시킨다.
        if (isApiErrorCode(e, 'IDEMPOTENCY_CONFLICT')) setSuccessNonce((n) => n + 1)
        setOrderError(toUserMessage(e, ORDER_ERROR_MESSAGES))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [disableReason, idempotencyKey, quantityNumber, selected, side],
  )

  const stale = lastMessageAt !== null && now - lastMessageAt > STALE_MS
  // 백엔드는 전일 종가를 주지 않는다. 등락률은 당일 첫 분봉의 시가 대비로만 계산할 수 있다.
  const openPrice = candles.length > 0 ? candles[0].open : null
  const changePercent =
    openPrice !== null && openPrice !== 0 && currentPrice !== null
      ? ((currentPrice - openPrice) / openPrice) * 100
      : null

  const emptyChartMessage = candlesLoading
    ? '분봉을 불러오는 중입니다.'
    : marketStatus === 'CLOSED'
      ? '장 준비 전입니다. 분봉은 09:01부터 공개됩니다.'
      : '아직 공개된 분봉이 없습니다. 매분 새 봉이 추가됩니다.'

  return (
    <div className="relative min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 left-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-6xl">
        {/* 1. 헤더 + 시세 상태 */}
        <header>
          <Eyebrow>거래</Eyebrow>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
            주식 시장가 매매
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill active={streamState === 'open' && !stale}>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  streamState === 'open' && !stale ? 'animate-pulse-soft bg-brand' : 'bg-muted'
                }`}
                aria-hidden
              />
              {streamStateLabels[streamState]}
            </Pill>
            <Pill active={marketStatus === 'OPEN'}>
              {marketStatus === 'OPEN'
                ? '장 운영 중'
                : marketStatus === 'CLOSED'
                  ? '장 마감'
                  : '장 상태 확인 중'}
            </Pill>
            {sourceTradingDate && <Pill>{sourceTradingDate} 장 재생 중</Pill>}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {sourceTradingDate
              ? `실제 거래일 ${sourceTradingDate} 의 시세를 오늘 장 시간에 맞춰 재생합니다. 차트와 시세에 찍힌 시각은 오늘이 아니라 그 거래일 기준입니다.`
              : '과거 거래일의 시세를 오늘 장 시간에 맞춰 재생하는 방식입니다. 재생할 거래일이 준비되면 여기에 표시됩니다.'}
          </p>
          {stale && (
            <p className="mt-2 text-sm text-loss">
              시세 수신이 40초 이상 없습니다. 자동으로 재연결을 시도하고 있습니다.
            </p>
          )}
          {streamError && <p className="mt-2 text-sm text-loss">{streamError}</p>}
          {instrumentsError && (
            <p className="mt-2 text-sm text-loss">{toUserMessage(instrumentsError)}</p>
          )}
        </header>

        {/* 2. 계좌 요약 스트립 */}
        <Card className="mt-8" accent="brand" innerClassName="p-6">
          {accountError ? (
            <p className="text-sm text-loss">{accountError}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <Stat label="총 평가자산" value={account ? formatKRW(account.totalValue) : '—'} />
              <Stat label="주문가능 현금" value={account ? formatKRW(account.cashBalance) : '—'} />
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          {/* 3. 종목 목록 */}
          <Card innerClassName="p-4">
            <h2 className="px-2 pb-2 text-sm font-semibold text-ink">종목</h2>
            {instrumentsLoading ? (
              <p className="px-2 py-6 text-sm text-muted">종목을 불러오는 중입니다.</p>
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-y-auto lg:max-h-[36rem]">
                {stocks.map((instrument) => {
                  const price = prices[instrument.symbol]
                  const active = instrument.instrumentId === selectedId
                  return (
                    <li key={instrument.instrumentId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(instrument.instrumentId)}
                        aria-current={active}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-300 ${
                          active ? 'bg-brand-soft ring-1 ring-brand/40' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-sm font-medium ${
                              active ? 'text-brand' : 'text-ink'
                            }`}
                          >
                            {instrument.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted tabular">
                            {instrument.symbol}
                          </span>
                        </span>
                        <span className="flex-none text-right">
                          {price && price.status === 'AVAILABLE' && price.price !== null ? (
                            <span className="block text-sm font-medium text-ink tabular">
                              {formatKRW(price.price)}
                            </span>
                          ) : (
                            <span className="block text-xs text-muted">시세 없음</span>
                          )}
                          {!instrument.tradable && (
                            <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted">
                              거래정지
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div className="space-y-6">
            {/* 4. 차트 */}
            <Card innerClassName="p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">
                    {selected ? selected.name : '종목을 선택해 주세요'}
                  </h2>
                  <p className="mt-1 text-xs text-muted tabular">
                    {selected ? selected.symbol : '—'}
                    {snapshot?.sourceTime ? ` · ${formatHhMm(snapshot.sourceTime)} 기준` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-ink tabular">
                    {currentPrice !== null ? formatKRW(currentPrice) : '시세 없음'}
                  </p>
                  {changePercent !== null && (
                    <p className={`mt-1 text-xs tabular ${pnlTone(changePercent)}`}>
                      당일 시가 대비 {formatPercent(changePercent)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <CandleChart candles={candles} emptyMessage={emptyChartMessage} />
              </div>
              {candlesError && (
                <p className="mt-3 text-xs text-loss">{toUserMessage(candlesError)}</p>
              )}
              <p className="mt-3 text-xs text-muted">
                1분봉입니다. 마감되지 않은 분봉은 공개되지 않아 새 봉은 매분 한 박자 늦게 추가됩니다.
              </p>
            </Card>

            {/* 5. 주문 패널 */}
            <Card accent="brand" innerClassName="p-6">
              <h2 className="font-display text-xl font-semibold text-ink">주문</h2>
              <p className="mt-1 text-xs text-muted">
                시장가 주문만 지원합니다. 주문하면 즉시 체결되고 수수료는 서버가 계산합니다.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                  {(['BUY', 'SELL'] as OrderSide[]).map((value) => {
                    const active = side === value
                    const activeTone =
                      value === 'BUY'
                        ? 'bg-gain/15 text-gain ring-1 ring-gain/40'
                        : 'bg-loss/15 text-loss ring-1 ring-loss/40'
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSide(value)}
                        aria-pressed={active}
                        className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                          active ? activeTone : 'text-muted hover:text-ink'
                        }`}
                      >
                        {sideLabels[value]}
                      </button>
                    )
                  })}
                </div>

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <label htmlFor="order-quantity" className="text-sm font-medium text-ink">
                      수량 (주)
                    </label>
                    {side === 'SELL' ? (
                      <span className="text-xs text-muted tabular">
                        보유 {held.toLocaleString('ko-KR')}주
                        {held > 0 && (
                          <button
                            type="button"
                            onClick={() => setQuantity(String(held))}
                            className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-brand transition-colors hover:bg-white/[0.1]"
                          >
                            전량
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted tabular">
                        주문가능 {account ? formatKRW(account.cashBalance) : '—'}
                      </span>
                    )}
                  </div>
                  <input
                    id="order-quantity"
                    // 정수만 허용해야 하므로 number 대신 text + 숫자 필터로 소수점 입력을 원천 차단한다.
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                </div>

                <div className="space-y-1.5 rounded-2xl bg-elevated px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">예상 주문금액 (추정)</span>
                    <span className="font-medium text-ink tabular">
                      {estimatedAmount !== null ? formatKRW(estimatedAmount) : '—'}
                    </span>
                  </div>
                  {selected && selected.minOrderAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">최소 주문금액</span>
                      <span className="text-muted tabular">
                        {formatKRW(selected.minOrderAmount)}
                      </span>
                    </div>
                  )}
                  <p className="pt-1 text-xs leading-relaxed text-muted">
                    현재가 × 수량으로 계산한 추정치입니다. 실제 체결가와 수수료는 체결 시점에 서버가
                    확정합니다.
                  </p>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting || disableReason !== null}
                >
                  {submitting ? '주문 처리 중' : `${sideLabels[side]} 주문`}
                </Button>
              </form>

              {disableReason && (
                <p className="mt-3 text-xs leading-relaxed text-muted">{disableReason}</p>
              )}
              {orderError && <p className="mt-3 text-sm text-loss">{orderError}</p>}

              {result && (
                <div className="mt-5 rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
                  <p className="text-sm font-medium text-brand">
                    {sideLabels[result.side]} 주문이 체결되었습니다.
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted">체결단가</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatKRW(result.price)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">수량</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatQty(result.quantity)}주</dd>
                    </div>
                    <div>
                      <dt className="text-muted">거래금액</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatKRW(result.amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">수수료</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatKRW(result.fee)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">실현손익</dt>
                      <dd
                        className={`mt-0.5 tabular ${
                          result.realizedPnl === null ? 'text-muted' : pnlTone(result.realizedPnl)
                        }`}
                      >
                        {result.realizedPnl === null ? '—' : signedKRW(result.realizedPnl)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">체결시각</dt>
                      <dd className="mt-0.5 text-ink tabular">
                        {formatDateTime(result.executedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
