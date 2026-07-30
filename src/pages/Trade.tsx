// 주식·코인 시장가 매매 화면 — 시장 탭으로 전환하며 시세(주식 SSE / 코인 폴링)·분봉·주문을 한 화면에서 처리한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CandleChart } from '../components/CandleChart'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { useCandles } from '../hooks/useCandles'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
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
import { bumpAccount } from '../lib/accountPulse'
import type {
  AccountSummary,
  Holding,
  Instrument,
  Market,
  OrderExecutionResponse,
  OrderSide,
  PriceResponse,
} from '../services/types'

/** 서버 heartbeat 가 20초 주기이므로 이보다 오래 조용하면 정체로 본다. */
const STALE_MS = 40_000
/** 코인 시세·캔들 폴링 주기. 코인은 SSE 가 없다. */
const CRYPTO_POLL_MS = 5_000
/** 코인 계좌·보유는 시세와 달리 자주 바뀌지 않는다 — 더 느리게 다시 읽는다. */
const CRYPTO_ACCOUNT_REFRESH_MS = 15_000
/** 코인 수량 소수 자릿수 상한. 백엔드 scale 이 8 이다. */
const CRYPTO_QTY_DECIMALS = 8

const streamStateLabels: Record<StreamConnectionState, string> = {
  idle: '시세 대기',
  connecting: '시세 연결 중',
  open: '실시간 수신',
  reconnecting: '재연결 중',
  closed: '시세 연결 종료',
}

/** 주문 실패 시 화면 문맥에 맞게 덮어쓰는 문구. 백엔드 message 는 쓰지 않고 code 로만 분기한다. */
const ORDER_ERROR_MESSAGES: Record<Market, Record<string, string>> = {
  STOCK: {
    MARKET_CLOSED: '장 시간이 아닙니다 (09:00~15:30). 주문이 접수되지 않았습니다.',
    PRICE_UNAVAILABLE: '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.',
    INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다. 수량을 줄여 주세요.',
    INSUFFICIENT_QTY: '보유 수량이 부족합니다. 보유 수량을 다시 확인해 주세요.',
    IDEMPOTENCY_CONFLICT: '직전 주문과 요청이 충돌했습니다. 주문 내용을 확인하고 다시 시도해 주세요.',
    VALIDATION_ERROR: '주식은 1주 단위 정수만 주문할 수 있습니다. 수량을 확인해 주세요.',
    NOT_FOUND: '종목 또는 계좌를 찾을 수 없습니다.',
  },
  CRYPTO: {
    PRICE_UNAVAILABLE: '지금 이 코인의 시세를 받을 수 없어 주문할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다. 수량을 줄여 주세요.',
    INSUFFICIENT_QTY: '보유 수량이 부족합니다. 보유 수량을 다시 확인해 주세요.',
    IDEMPOTENCY_CONFLICT: '직전 주문과 요청이 충돌했습니다. 주문 내용을 확인하고 다시 시도해 주세요.',
    VALIDATION_ERROR: '주문 수량 형식을 확인해 주세요. 소수점 8자리까지 입력할 수 있습니다.',
    NOT_FOUND: '종목 또는 계좌를 찾을 수 없습니다.',
  },
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

/**
 * 수량 입력창에 넣을 문자열. String(0.00000001) 은 "1e-8" 이 되고 그대로 주문 본문에 실리면
 * 백엔드가 파싱하지 못한다 → 항상 고정 소수로 만든 뒤 꼬리 0 만 지운다.
 */
function toQtyInput(value: number): string {
  return value
    .toFixed(CRYPTO_QTY_DECIMALS)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

/** 코인은 1원 미만 단위까지 움직인다 — 원화 반올림으로 0 이 되지 않게 소수점을 남긴다. */
function formatPrice(value: number): string {
  if (value >= 1000) return formatKRW(value)
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원`
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
  const [market, setMarket] = useState<Market>('STOCK')
  const isCrypto = market === 'CRYPTO'
  const accent = isCrypto ? 'coin' : 'brand'

  // 코인 탭에서는 주식 SSE 를 붙잡아 둘 이유가 없다.
  const {
    prices: stockPrices,
    marketStatus,
    sourceTradingDate,
    state: streamState,
    lastMessageAt,
    error: streamError,
  } = useStockStream({ enabled: !isCrypto })
  const { index, loading: instrumentsLoading, error: instrumentsError } = useInstruments()

  // 정체 판정용 시계. lastMessageAt 은 조용해지면 갱신되지 않으므로 별도 tick 이 필요하다.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  const instruments = useMemo<Instrument[]>(
    () =>
      index
        ? [...index.byId.values()]
            .filter((i) => i.market === market)
            .sort((a, b) => a.instrumentId - b.instrumentId)
        : [],
    [index, market],
  )

  const cryptoIds = useMemo(
    () => (isCrypto ? instruments.map((i) => i.instrumentId) : []),
    [instruments, isCrypto],
  )
  const {
    prices: cryptoPrices,
    lastUpdatedAt: cryptoUpdatedAt,
    error: cryptoPriceError,
  } = useCryptoPrices({ instrumentIds: cryptoIds, enabled: isCrypto, pollMs: CRYPTO_POLL_MS })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  // 시장이 바뀌면 앞 시장의 종목 선택은 무효다.
  useEffect(() => {
    setSelectedId(null)
  }, [market])
  useEffect(() => {
    if (selectedId === null && instruments.length > 0) setSelectedId(instruments[0].instrumentId)
  }, [selectedId, instruments])

  const selected = selectedId === null ? null : (index?.byId.get(selectedId) ?? null)
  // 주식 스트림은 instrumentId 가 아니라 symbol 로 키를 잡는다. 코인은 instrumentId 다.
  const snapshot: { price: number | null; sourceTime: string | null; status: string } | undefined =
    selected
      ? isCrypto
        ? (cryptoPrices[selected.instrumentId] as PriceResponse | undefined)
        : stockPrices[selected.symbol]
      : undefined
  const currentPrice = snapshot?.status === 'AVAILABLE' ? snapshot.price : null

  // 주식은 서버 분 크론에만 새 봉이 생긴다 → 분이 넘어갈 때만 재조회한다. 코인은 폴링이다.
  const minuteTick = Math.floor((lastMessageAt ?? 0) / 60_000)
  const {
    candles,
    loading: candlesLoading,
    error: candlesError,
  } = useCandles({
    instrumentId: selectedId,
    market,
    minuteTick,
    pollMs: CRYPTO_POLL_MS,
  })

  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountNonce, setAccountNonce] = useState(0)

  // 코인은 분 tick 이 없다 — 자체 주기로 계좌·보유를 다시 읽는다.
  const [cryptoAccountTick, setCryptoAccountTick] = useState(0)
  useEffect(() => {
    if (!isCrypto) return
    const timer = setInterval(() => setCryptoAccountTick((n) => n + 1), CRYPTO_ACCOUNT_REFRESH_MS)
    return () => clearInterval(timer)
  }, [isCrypto])

  // 두 계좌는 완전히 분리돼 있다. 새 응답이 오기 전까지 앞 시장의 잔고를 그대로 두면 안 된다.
  useEffect(() => {
    setAccount(null)
    setHoldings(null)
    setAccountError(null)
  }, [market])

  // 잔고는 스트림으로 오지 않는다. 시장 전환·분 경과·주문 성공 직후에 직접 다시 읽는다.
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
  }, [market, minuteTick, accountNonce, cryptoAccountTick])

  const held = useMemo(() => {
    if (!holdings || !selected) return 0
    const holding = holdings.find((h) => h.instrumentId === selected.instrumentId)
    if (!holding) return 0
    // 주식은 정수 주만 주문할 수 있고, 코인은 소수 수량 그대로 매도할 수 있다.
    return isCrypto ? holding.quantity : Math.floor(holding.quantity)
  }, [holdings, isCrypto, selected])

  const [side, setSide] = useState<OrderSide>('BUY')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [result, setResult] = useState<OrderExecutionResponse | null>(null)
  // 성공한 주문의 키를 그대로 재사용하면 서버가 같은 체결을 재생해 두 번째 주문이 조용히 삼켜진다.
  const [successNonce, setSuccessNonce] = useState(0)
  // disabled 상태만으로는 빠른 더블클릭이 두 핸들러를 모두 통과한다. 동기 플래그로 한 번 더 막는다.
  const submittingRef = useRef(false)

  const idempotencyKey = useIdempotencyKey([market, selectedId, side, quantity, successNonce])

  // 시장·종목·매매구분이 바뀌면 앞선 체결 결과와 오류는 더 이상 이 주문의 것이 아니다.
  useEffect(() => {
    setResult(null)
    setOrderError(null)
    setQuantity('')
  }, [market, selectedId, side])

  const quantityNumber = quantity === '' ? 0 : Number(quantity)
  const estimatedAmount =
    currentPrice !== null && quantityNumber > 0 ? currentPrice * quantityNumber : null

  const handleQuantityChange = (raw: string) => {
    if (isCrypto) {
      // 코인은 소수 수량이다. 숫자와 소수점 하나만 남기고 소수 8자리로 자른다.
      let cleaned = raw.replace(/[^0-9.]/g, '')
      const firstDot = cleaned.indexOf('.')
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
        const [whole, frac = ''] = cleaned.split('.')
        cleaned = `${whole}.${frac.slice(0, CRYPTO_QTY_DECIMALS)}`
      }
      if (side === 'SELL' && held > 0 && cleaned !== '' && Number(cleaned) > held) {
        setQuantity(toQtyInput(held))
        return
      }
      setQuantity(cleaned)
      return
    }
    // 주식 수량에 소수점이 있으면 백엔드가 400 VALIDATION_ERROR 를 낸다 → 입력 자체에서 막는다.
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    if (side === 'SELL' && held > 0 && digits !== '' && Number(digits) > held) {
      setQuantity(toQtyInput(held))
      return
    }
    setQuantity(digits)
  }

  const disableReason = useMemo<string | null>(() => {
    if (!selected) return '주문할 종목을 선택해 주세요.'
    if (!selected.tradable) return '거래정지 종목입니다.'
    if (!isCrypto && streamState !== 'open')
      return '시세 서버에 연결하는 중입니다. 잠시 후 다시 시도해 주세요.'
    // 코인은 24시간 거래라 장 운영 시간 개념이 없다.
    if (!isCrypto && marketStatus !== 'OPEN') return '장 시간이 아닙니다 (09:00~15:30).'
    if (isCrypto && snapshot === undefined) return '시세를 불러오는 중입니다.'
    if (!snapshot || snapshot.status === 'UNAVAILABLE' || snapshot.price === null)
      return isCrypto
        ? '지금 이 코인의 시세를 받을 수 없습니다. 시세가 다시 들어오면 주문할 수 있습니다.'
        : '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.'
    if (quantityNumber <= 0)
      return isCrypto ? '주문 수량을 입력해 주세요. (예: 0.001)' : '주문 수량을 1주 이상 입력해 주세요.'
    if (side === 'SELL' && held <= 0) return '보유한 수량이 없어 매도할 수 없습니다.'
    if (side === 'SELL' && quantityNumber > held)
      return `보유 수량이 부족합니다. (보유 ${formatQty(held)})`
    if (
      side === 'BUY' &&
      selected.minOrderAmount > 0 &&
      estimatedAmount !== null &&
      estimatedAmount < selected.minOrderAmount
    )
      return `최소 주문금액은 ${formatKRW(selected.minOrderAmount)}입니다.`
    return null
  }, [
    estimatedAmount,
    held,
    isCrypto,
    marketStatus,
    quantityNumber,
    selected,
    side,
    snapshot,
    streamState,
  ])

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
            market,
            instrumentId: selected.instrumentId,
            side,
            orderType: 'MARKET',
            // 코인 소수 수량은 입력 문자열 그대로 보낸다 (Number 변환은 지수 표기로 깨질 수 있다).
            quantity: isCrypto ? quantity : String(quantityNumber),
          },
          idempotencyKey,
        )
        setResult(execution)
        setSuccessNonce((n) => n + 1)
        setAccountNonce((n) => n + 1) // 잔고·보유는 스트림이 아니라 직접 다시 읽어야 갱신된다
        bumpAccount() // 상단 내비의 지갑처럼 이 화면 밖에 있는 소비자에게도 알린다
      } catch (e) {
        // 같은 본문 재시도는 키를 유지해야 서버가 원래 응답을 재생한다.
        // 충돌은 우리 키 관리가 어긋난 경우이므로 자동 재시도 없이 키만 회전시킨다.
        if (isApiErrorCode(e, 'IDEMPOTENCY_CONFLICT')) setSuccessNonce((n) => n + 1)
        setOrderError(toUserMessage(e, ORDER_ERROR_MESSAGES[market]))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [disableReason, idempotencyKey, isCrypto, market, quantity, quantityNumber, selected, side],
  )

  const stale = isCrypto
    ? cryptoUpdatedAt !== null && now - cryptoUpdatedAt > CRYPTO_POLL_MS * 4
    : lastMessageAt !== null && now - lastMessageAt > STALE_MS
  // 백엔드는 전일 종가를 주지 않는다. 등락률은 첫 분봉의 시가 대비로만 계산할 수 있다.
  const openPrice = candles.length > 0 ? candles[0].open : null
  const changePercent =
    openPrice !== null && openPrice !== 0 && currentPrice !== null
      ? ((currentPrice - openPrice) / openPrice) * 100
      : null

  const emptyChartMessage = candlesLoading
    ? '분봉을 불러오는 중입니다.'
    : isCrypto
      ? '아직 수집된 분봉이 없습니다. 빗썸 시세가 들어오면 5초마다 갱신됩니다.'
      : marketStatus === 'CLOSED'
        ? '장 준비 전입니다. 분봉은 09:01부터 공개됩니다.'
        : '아직 공개된 분봉이 없습니다. 매분 새 봉이 추가됩니다.'

  return (
    <div className="relative min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 left-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-6xl">
        {/* 1. 헤더 + 시장 탭 + 시세 상태 */}
        <header>
          <Eyebrow>거래</Eyebrow>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
            {isCrypto ? '코인 시장가 매매' : '주식 시장가 매매'}
          </h1>

          <MarketTabs market={market} onChange={setMarket} className="mt-5" />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isCrypto ? (
              <>
                <Pill active={!stale}>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      stale ? 'bg-muted' : 'animate-pulse-soft bg-coin'
                    }`}
                    aria-hidden
                  />
                  {cryptoUpdatedAt === null ? '시세 불러오는 중' : '5초 폴링 수신'}
                </Pill>
                <Pill active>24시간 거래</Pill>
                <Pill>빗썸 실시세</Pill>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {isCrypto
              ? '빗썸 실시간 시세를 그대로 사용합니다. 코인은 전용 스트림이 없어 5초마다 현재가와 분봉을 다시 불러오며, 진행 중인 분봉도 함께 갱신됩니다.'
              : sourceTradingDate
                ? `실제 거래일 ${sourceTradingDate} 의 시세를 오늘 장 시간에 맞춰 재생합니다. 차트와 시세에 찍힌 시각은 오늘이 아니라 그 거래일 기준입니다.`
                : '과거 거래일의 시세를 오늘 장 시간에 맞춰 재생하는 방식입니다. 재생할 거래일이 준비되면 여기에 표시됩니다.'}
          </p>
          {stale && !isCrypto && (
            <p className="mt-2 text-sm text-loss">
              시세 수신이 40초 이상 없습니다. 자동으로 재연결을 시도하고 있습니다.
            </p>
          )}
          {streamError && !isCrypto && <p className="mt-2 text-sm text-loss">{streamError}</p>}
          {cryptoPriceError && isCrypto && (
            <p className="mt-2 text-sm text-loss">{cryptoPriceError}</p>
          )}
          {instrumentsError && (
            <p className="mt-2 text-sm text-loss">{toUserMessage(instrumentsError)}</p>
          )}
        </header>

        {/* 2. 계좌 요약 스트립 */}
        <Card className="mt-8" accent={accent} innerClassName="p-6">
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
            <h2 className="px-2 pb-2 text-sm font-semibold text-ink">
              {isCrypto ? '코인' : '종목'}
            </h2>
            {instrumentsLoading ? (
              <p className="px-2 py-6 text-sm text-muted">종목을 불러오는 중입니다.</p>
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-y-auto lg:max-h-[36rem]">
                {instruments.map((instrument) => {
                  const price = isCrypto
                    ? cryptoPrices[instrument.instrumentId]
                    : stockPrices[instrument.symbol]
                  const active = instrument.instrumentId === selectedId
                  const activeTone = isCrypto
                    ? 'bg-coin-soft ring-1 ring-coin/40'
                    : 'bg-brand-soft ring-1 ring-brand/40'
                  return (
                    <li key={instrument.instrumentId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(instrument.instrumentId)}
                        aria-current={active}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-300 ${
                          active ? activeTone : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-sm font-medium ${
                              active ? (isCrypto ? 'text-coin' : 'text-brand') : 'text-ink'
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
                              {formatPrice(price.price)}
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
                    {currentPrice !== null ? formatPrice(currentPrice) : '시세 없음'}
                  </p>
                  {changePercent !== null && (
                    <p className={`mt-1 text-xs tabular ${pnlTone(changePercent)}`}>
                      {isCrypto ? '차트 시작 대비' : '당일 시가 대비'} {formatPercent(changePercent)}
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
                {isCrypto
                  ? '1분봉입니다. 진행 중인 분봉도 포함되어 5초마다 마지막 봉이 제자리에서 갱신됩니다.'
                  : '1분봉입니다. 마감되지 않은 분봉은 공개되지 않아 새 봉은 매분 한 박자 늦게 추가됩니다.'}
              </p>
            </Card>

            {/* 5. 주문 패널 */}
            <Card accent={accent} innerClassName="p-6">
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
                      {isCrypto ? '수량 (소수점 가능)' : '수량 (주)'}
                    </label>
                    {side === 'SELL' ? (
                      <span className="text-xs text-muted tabular">
                        보유 {formatQty(held)}
                        {isCrypto ? '' : '주'}
                        {held > 0 && (
                          <button
                            type="button"
                            onClick={() => setQuantity(toQtyInput(held))}
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
                    // 형식을 직접 통제해야 하므로 number 대신 text + 시장별 필터를 쓴다.
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={isCrypto ? '0.001' : '0'}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                  {isCrypto && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['0.001', '0.01', '0.1', '1'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleQuantityChange(preset)}
                          className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  )}
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
                <div
                  className={`mt-5 rounded-2xl border p-4 ${
                    isCrypto ? 'border-coin/30 bg-coin-soft/40' : 'border-brand/30 bg-brand-soft/40'
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${isCrypto ? 'text-coin' : 'text-brand'}`}
                  >
                    {sideLabels[result.side]} 주문이 체결되었습니다.
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted">체결단가</dt>
                      <dd className="mt-0.5 text-ink tabular">{formatPrice(result.price)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">수량</dt>
                      <dd className="mt-0.5 text-ink tabular">
                        {formatQty(result.quantity)}
                        {isCrypto ? '' : '주'}
                      </dd>
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
