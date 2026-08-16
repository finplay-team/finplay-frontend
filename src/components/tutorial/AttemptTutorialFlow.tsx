// 영속 attempt를 정본으로 종목 선택부터 완료 replay까지 단일 차트 실습 흐름을 제공하는 컴포넌트
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CandleChart } from '../CandleChart'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { bumpAccount } from '../../lib/accountPulse'
import { formatDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { loadInstruments } from '../../services/instrumentService'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import {
  getPracticeAttemptChart,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeTutorialChartResponse,
} from '../../services/tutorialTypes'
import type { Candle, Instrument, LimitOrderResponse, Market } from '../../services/types'

const TICK_MS = 3000
const REFLECTION_MAX = 2000
type TutorialOrderType = 'MARKET' | 'LIMIT'

function latestEvidence(progress: InvestmentPracticeResponse): PracticeEvidenceResponse | null {
  return [...progress.steps]
    .reverse()
    .map((step) => step.evidence)
    .find(
      (evidence) =>
        evidence.holdingId !== null ||
        evidence.buyTradeId !== null ||
        evidence.buyQuantity !== null ||
        evidence.reflectionId !== null,
    ) ?? null
}

function toChartCandles(chart: PracticeTutorialChartResponse | null): Candle[] {
  if (!chart) return []
  return chart.candles.map((candle) => ({
    sourceTime: `${candle.date}T00:00:00`,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: 0,
  }))
}

function RiskEducationCard({ attempt }: { attempt: PracticeAttemptResponse }) {
  const risk = attempt.riskSnapshot
  if (!risk) return null
  return (
    <Card accent={attempt.market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">서버가 고정한 위험 기준</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">매수 체결가</dt>
          <dd className="mt-1 tabular text-base text-ink">{formatKRW(risk.entryPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">손절 교육선 · -3%</dt>
          <dd className="mt-1 tabular text-base text-loss">{formatKRW(risk.stopLossPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">익절 교육선 · +5%</dt>
          <dd className="mt-1 tabular text-base text-gain">{formatKRW(risk.takeProfitPrice)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        이 값은 정답이나 자동 주문이 아니라 위험을 숫자로 바라보는 연습 기준입니다. 최초 매수 체결가에서
        서버가 한 번만 계산하며, 현재 가격이 움직여도 이번 실행 동안 바뀌지 않습니다.
      </p>
    </Card>
  )
}

export function AttemptTutorialFlow({
  market,
  attempt,
  progress,
  onAttemptChange,
  onRefresh,
}: {
  market: Market
  attempt: PracticeAttemptResponse
  progress: InvestmentPracticeResponse
  onAttemptChange: (attempt: PracticeAttemptResponse) => void
  onRefresh: () => Promise<void>
}) {
  const replay = attempt.mode === 'REPLAY' || attempt.status === 'COMPLETED'
  const [chart, setChart] = useState<PracticeTutorialChartResponse | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [busyInstrumentId, setBusyInstrumentId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(market === 'STOCK' ? '1' : '1')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const [buyOrderType, setBuyOrderType] = useState<TutorialOrderType>('MARKET')
  const [buyLimitPrice, setBuyLimitPrice] = useState('')
  const [observing, setObserving] = useState(false)
  const [selling, setSelling] = useState(false)
  const [sellOrderType, setSellOrderType] = useState<TutorialOrderType>('MARKET')
  const [sellLimitPrice, setSellLimitPrice] = useState('')
  const [pendingOrder, setPendingOrder] = useState<LimitOrderResponse | null>(null)
  const [cancellingPending, setCancellingPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [reflecting, setReflecting] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const buyNonceRef = useRef(0)
  const sellNonceRef = useRef(0)

  const evidence = useMemo(() => latestEvidence(progress), [progress])
  const holdingId = evidence?.holdingId ?? null
  const remainingQuantity = evidence?.remainingQuantity ?? null
  const fullySold =
    evidence?.buyQuantity !== null &&
    evidence?.buyQuantity !== undefined &&
    evidence.buyQuantity > 0 &&
    remainingQuantity !== null &&
    remainingQuantity <= 0
  const observed = progress.steps.some((step) => step.evidence.observationId !== null)
  const expired = progress.steps.find((step) => step.step === 4)?.status === 'EXPIRED'
  const candles = useMemo(() => toChartCandles(chart), [chart])
  const latestPrice = chart && chart.candles.length > 0 ? chart.candles[chart.candles.length - 1].close : null
  const buyKey = useIdempotencyKey([
    attempt.attemptId,
    attempt.runNumber,
    'BUY',
    quantity,
    buyOrderType,
    buyLimitPrice,
    buyNonceRef.current,
  ])
  const sellKey = useIdempotencyKey([
    attempt.attemptId,
    attempt.runNumber,
    'SELL',
    remainingQuantity,
    sellOrderType,
    sellLimitPrice,
    sellNonceRef.current,
  ])
  const pendingOrderRef = useRef(pendingOrder)
  useEffect(() => {
    pendingOrderRef.current = pendingOrder
  }, [pendingOrder])

  useEffect(() => {
    if (attempt.status !== 'SELECTING_INSTRUMENT') return
    let cancelled = false
    loadInstruments(market)
      .then((items) => {
        if (!cancelled) setInstruments(items.filter((item) => item.isTutorialSample && item.tradable))
      })
      .catch((error) => {
        if (!cancelled) setMutationError(toUserMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [attempt.status, market])

  useEffect(() => {
    if (attempt.instrumentId === null) {
      setChart(null)
      setChartReady(false)
      return
    }
    let cancelled = false
    setChartReady(false)
    setChartError(null)
    getPracticeAttemptChart(market)
      .then((response) => {
        if (!cancelled) {
          setChart(response)
          setChartReady(true)
        }
      })
      .catch((error) => {
        if (!cancelled) setChartError(toUserMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [attempt.attemptId, attempt.instrumentId, attempt.runNumber, market])

  useEffect(() => {
    if (market !== 'CRYPTO' || replay || attempt.instrumentId === null) return
    let cancelled = false
    getPendingOrders({ market: 'CRYPTO', limit: 100 })
      .then((page) => {
        if (cancelled) return
        const found = page.content.find(
          (order) =>
            order.instrumentId === attempt.instrumentId &&
            order.orderType === 'LIMIT' &&
            order.practiceAttemptId === attempt.attemptId &&
            order.practiceAttemptRunNumber === attempt.runNumber,
        )
        if (!found || found.limitPrice === null) return
        setPendingOrder({
          ...found,
          market: 'CRYPTO',
          orderType: 'LIMIT',
          status: 'PENDING',
          limitPrice: found.limitPrice,
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [attempt.instrumentId, market, replay])

  useEffect(() => {
    if (replay || !chartReady || attempt.status !== 'IN_PROGRESS' || attempt.instrumentId === null) return
    let stopped = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      if (inFlight) return
      if (document.hidden) {
        if (!stopped) timer = setTimeout(poll, TICK_MS)
        return
      }
      inFlight = true
      try {
        const response = await tickPracticeAttempt(market)
        if (stopped) return
        setChart(response)
        setChartError(null)
        const pending = pendingOrderRef.current
        if (pending) {
          const page = await getPendingOrders({ market: 'CRYPTO', limit: 100 })
          if (!page.content.some((order) => order.orderId === pending.orderId)) {
            setPendingOrder(null)
          }
        }
        await onRefresh()
      } catch (error) {
        if (!stopped) setChartError(toUserMessage(error))
      } finally {
        inFlight = false
        if (!stopped) timer = setTimeout(poll, TICK_MS)
      }
    }
    timer = setTimeout(poll, TICK_MS)
    const handleVisibilityChange = () => {
      if (!document.hidden && timer && !inFlight) {
        clearTimeout(timer)
        timer = setTimeout(poll, 0)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [attempt.instrumentId, attempt.runNumber, attempt.status, chartReady, market, onRefresh, replay])

  const handleSelect = useCallback(
    async (instrumentId: number) => {
      setBusyInstrumentId(instrumentId)
      setMutationError(null)
      try {
        const selected = await selectPracticeInstrument(market, instrumentId)
        onAttemptChange(selected)
        await onRefresh()
      } catch (error) {
        setMutationError(toUserMessage(error))
      } finally {
        setBusyInstrumentId(null)
      }
    },
    [market, onAttemptChange, onRefresh],
  )

  const handleRestart = useCallback(async () => {
    if (replay || !window.confirm('현재 실행의 미체결 주문과 샘플 보유를 정리하고 종목 선택부터 다시 시작할까요?')) {
      return
    }
    setRestarting(true)
    setMutationError(null)
    try {
      const restarted = await restartPracticeAttempt(market)
      setChart(null)
      setChartReady(false)
      setAnswer('')
      setQuantity('1')
      onAttemptChange(restarted)
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setRestarting(false)
    }
  }, [market, onAttemptChange, onRefresh, replay])

  const handleBuy = useCallback(async () => {
    if (attempt.instrumentId === null) return
    const parsed = Number(quantity)
    if (!(parsed > 0) || (market === 'STOCK' && !Number.isInteger(parsed))) {
      setMutationError(market === 'STOCK' ? '주식 수량은 1주 이상의 정수로 입력해 주세요.' : '수량을 입력해 주세요.')
      return
    }
    setBuying(true)
    setMutationError(null)
    try {
      if (buyOrderType === 'LIMIT') {
        const parsedLimit = Number(buyLimitPrice)
        if (market !== 'CRYPTO' || !(parsedLimit > 0)) {
          setMutationError('지정가를 입력해 주세요.')
          return
        }
        const created = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: attempt.instrumentId,
            side: 'BUY',
            quantity,
            limitPrice: buyLimitPrice,
          },
          buyKey,
        )
        setPendingOrder(created)
        bumpTutorial()
        return
      }
      await placeOrder(
        {
          market,
          instrumentId: attempt.instrumentId,
          side: 'BUY',
          orderType: 'MARKET',
          quantity,
        },
        buyKey,
      )
      buyNonceRef.current += 1
      bumpAccount()
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setBuying(false)
    }
  }, [attempt.instrumentId, buyKey, buyLimitPrice, buyOrderType, market, onRefresh, quantity])

  const handleObserve = useCallback(async () => {
    if (holdingId === null) return
    setObserving(true)
    setMutationError(null)
    try {
      await recordHoldingObservation(holdingId)
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setObserving(false)
    }
  }, [holdingId, onRefresh])

  const handleSell = useCallback(async () => {
    if (attempt.instrumentId === null || remainingQuantity === null || remainingQuantity <= 0) return
    setSelling(true)
    setMutationError(null)
    try {
      if (sellOrderType === 'LIMIT') {
        const parsedLimit = Number(sellLimitPrice)
        if (market !== 'CRYPTO' || !(parsedLimit > 0)) {
          setMutationError('지정가를 입력해 주세요.')
          return
        }
        const created = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: attempt.instrumentId,
            side: 'SELL',
            quantity: String(remainingQuantity),
            limitPrice: sellLimitPrice,
          },
          sellKey,
        )
        setPendingOrder(created)
        bumpTutorial()
        return
      }
      await placeOrder(
        {
          market,
          instrumentId: attempt.instrumentId,
          side: 'SELL',
          orderType: 'MARKET',
          quantity: String(remainingQuantity),
        },
        sellKey,
      )
      sellNonceRef.current += 1
      bumpAccount()
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setSelling(false)
    }
  }, [attempt.instrumentId, market, onRefresh, remainingQuantity, sellKey, sellLimitPrice, sellOrderType])

  const handleCancelPending = useCallback(async () => {
    if (!pendingOrder || cancellingPending) return
    setCancellingPending(true)
    setMutationError(null)
    try {
      await cancelLimitOrder(pendingOrder.orderId)
      setPendingOrder(null)
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setCancellingPending(false)
    }
  }, [cancellingPending, onRefresh, pendingOrder])

  const handleReflection = useCallback(async () => {
    const trimmed = answer.trim()
    if (holdingId === null || trimmed.length === 0 || trimmed.length > REFLECTION_MAX) return
    setReflecting(true)
    setMutationError(null)
    try {
      await saveHoldingReflection(holdingId, trimmed)
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      setMutationError(toUserMessage(error))
    } finally {
      setReflecting(false)
    }
  }, [answer, holdingId, onRefresh])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            실행 #{attempt.runNumber} · {replay ? '완료 기록 다시 보기' : '진행 중'}
          </p>
          <p className="mt-1 text-xs text-muted">
            새로고침해도 같은 실행과 가격 흐름이 이어집니다.
          </p>
        </div>
        {!replay && (
          <Button type="button" size="sm" variant="ghost" disabled={restarting} onClick={() => void handleRestart()}>
            {restarting ? '정리하는 중…' : '처음부터 다시 시작'}
          </Button>
        )}
      </div>

      {attempt.instrumentId !== null && (
        <Card innerClassName="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">이번 실행의 29+1 일봉</p>
              <p className="mt-1 text-xs text-muted">29개 완결 일봉과 가상 12:00부터 진행 중인 오늘 일봉입니다.</p>
            </div>
            <p className="tabular text-sm text-ink">{latestPrice === null ? '불러오는 중…' : formatKRW(latestPrice)}</p>
          </div>
          <div className="mt-4">
            <CandleChart
              candles={candles}
              interval="1d"
              maxBars={30}
              height={260}
              emptyMessage="차트를 불러오는 중입니다."
              referenceLines={
                attempt.riskSnapshot
                  ? [
                      { value: attempt.riskSnapshot.stopLossPrice, tone: 'loss', label: '손절 -3%' },
                      { value: attempt.riskSnapshot.takeProfitPrice, tone: 'gain', label: '익절 +5%' },
                    ]
                  : undefined
              }
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {replay ? '완료 replay에서는 차트를 읽기만 하며 주문과 tick을 실행하지 않습니다.' : '서버 시간이 3초 지날 때마다 가상 1분이 진행됩니다.'}
          </p>
          {chartError && <p className="mt-2 text-sm text-loss">{chartError}</p>}
        </Card>
      )}

      <RiskEducationCard attempt={attempt} />

      {pendingOrder && !replay && (
        <Card innerClassName="p-5">
          <p className="text-sm font-medium text-ink">
            {pendingOrder.side === 'BUY' ? '매수' : '매도'} 지정가 주문이 체결을 기다리고 있습니다.
          </p>
          <p className="mt-2 text-xs text-muted">
            {pendingOrder.quantity}개 · {formatKRW(pendingOrder.limitPrice)} — 위 단일 차트의 tick이 이 주문을
            정산합니다.
          </p>
          <Button
            type="button"
            className="mt-4"
            size="sm"
            variant="ghost"
            disabled={cancellingPending}
            onClick={() => void handleCancelPending()}
          >
            {cancellingPending ? '취소하는 중…' : '지정가 주문 취소'}
          </Button>
        </Card>
      )}

      {replay ? (
        <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-6">
          <p className="text-lg font-semibold text-ink">이 시장의 실습을 완료했습니다</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            완료 기록과 보상은 그대로 유지됩니다. 이 화면에서는 주문·관찰·복기·재시작을 실행하지 않습니다.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-muted">매수 수량</dt><dd className="mt-1 tabular text-ink">{evidence?.buyQuantity ?? '-'}</dd></div>
            <div><dt className="text-xs text-muted">매도 수량</dt><dd className="mt-1 tabular text-ink">{evidence?.sellQuantity ?? '-'}</dd></div>
            <div><dt className="text-xs text-muted">남은 수량</dt><dd className="mt-1 tabular text-ink">{evidence?.remainingQuantity ?? '-'}</dd></div>
          </dl>
          {progress.completedAt && <p className="mt-4 text-xs text-muted">완료 {formatDateTime(progress.completedAt)}</p>}
        </Card>
      ) : attempt.status === 'SELECTING_INSTRUMENT' ? (
        <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-6">
          <h2 className="text-lg font-semibold text-ink">연습할 샘플 종목을 선택하세요</h2>
          <p className="mt-2 text-sm text-muted">선택하면 이번 실행의 결정적 가격 시계와 단일 차트가 시작됩니다.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {instruments.map((instrument) => (
              <button
                key={instrument.instrumentId}
                type="button"
                disabled={busyInstrumentId !== null}
                onClick={() => void handleSelect(instrument.instrumentId)}
                className="rounded-2xl border border-line bg-elevated p-4 text-left transition hover:border-brand/50 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-ink">{instrument.name}</span>
                <span className="mt-1 block text-xs text-muted">{instrument.symbol}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : expired ? (
        <p className="rounded-2xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
          이번 실행의 매도 시간이 만료되었습니다. 위의 “처음부터 다시 시작”으로 안전하게 정리한 뒤 다시 선택하세요.
        </p>
      ) : (
        <div className="space-y-4">
          {!attempt.riskSnapshot && (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">1. 매수해 위험 기준을 만듭니다</h2>
              {market === 'CRYPTO' && (
                <div className="mt-4 flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                  {(['MARKET', 'LIMIT'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={buyOrderType === type}
                      onClick={() => setBuyOrderType(type)}
                      className={`flex-1 rounded-full px-4 py-2 text-sm ${buyOrderType === type ? 'bg-coin text-coin-ink' : 'text-muted'}`}
                    >
                      {type === 'MARKET' ? '시장가' : '지정가'}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-40 flex-1 text-xs text-muted">
                  수량
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-brand"
                  />
                </label>
                {market === 'CRYPTO' && buyOrderType === 'LIMIT' && (
                  <label className="min-w-48 flex-1 text-xs text-muted">
                    지정가
                    <div className="mt-2 flex gap-2">
                      <input
                        value={buyLimitPrice}
                        onChange={(event) => setBuyLimitPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        className="min-w-0 flex-1 rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-coin"
                      />
                      <Button type="button" size="sm" variant="soft" disabled={latestPrice === null} onClick={() => setBuyLimitPrice(String(latestPrice ?? ''))}>
                        현재가
                      </Button>
                    </div>
                  </label>
                )}
                <Button type="button" disabled={buying || pendingOrder !== null} onClick={() => void handleBuy()}>
                  {buying ? '주문하는 중…' : buyOrderType === 'LIMIT' ? '지정가 매수 주문' : '시장가 매수'}
                </Button>
              </div>
            </Card>
          )}

          {attempt.riskSnapshot && !fullySold && (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">2. 단일 차트를 보고 가격을 관찰합니다</h2>
              <p className="mt-2 text-sm text-muted">
                가격이 손절·익절선에 가까워졌을 때 확인을 남겨보세요. 차트는 위에서 계속 이어집니다.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" variant="soft" disabled={observing || holdingId === null} onClick={() => void handleObserve()}>
                  {observing ? '기록하는 중…' : '현재 가격 관찰 기록'}
                </Button>
                {observed && <span className="text-xs text-gain">관찰 evidence가 저장되었습니다.</span>}
              </div>
            </Card>
          )}

          {attempt.riskSnapshot && (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">3. 남은 수량을 매도하고 복기합니다</h2>
              <p className="mt-2 text-sm text-muted">
                이번 실행 매수 {evidence?.buyQuantity ?? 0} · 매도 {evidence?.sellQuantity ?? 0} · 남은 수량 {remainingQuantity ?? 0}
              </p>
              {!fullySold && (
                <div className="mt-4 space-y-4">
                  {market === 'CRYPTO' && (
                    <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                      {(['MARKET', 'LIMIT'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={sellOrderType === type}
                          onClick={() => setSellOrderType(type)}
                          className={`flex-1 rounded-full px-4 py-2 text-sm ${sellOrderType === type ? 'bg-coin text-coin-ink' : 'text-muted'}`}
                        >
                          {type === 'MARKET' ? '시장가' : '지정가'}
                        </button>
                      ))}
                    </div>
                  )}
                  {market === 'CRYPTO' && sellOrderType === 'LIMIT' && (
                    <label className="block text-xs text-muted">
                      지정가
                      <div className="mt-2 flex gap-2">
                        <input
                          value={sellLimitPrice}
                          onChange={(event) => setSellLimitPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal"
                          className="min-w-0 flex-1 rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-coin"
                        />
                        <Button type="button" size="sm" variant="soft" disabled={latestPrice === null} onClick={() => setSellLimitPrice(String(latestPrice ?? ''))}>
                          현재가
                        </Button>
                      </div>
                    </label>
                  )}
                  <Button
                    type="button"
                    disabled={selling || pendingOrder !== null || remainingQuantity === null || remainingQuantity <= 0}
                    onClick={() => void handleSell()}
                  >
                    {selling
                      ? '주문하는 중…'
                      : sellOrderType === 'LIMIT'
                        ? `남은 ${remainingQuantity ?? 0} 지정가 매도 주문`
                        : `남은 ${remainingQuantity ?? 0} 전량 시장가 매도`}
                  </Button>
                </div>
              )}
              {fullySold && (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    maxLength={REFLECTION_MAX}
                    rows={5}
                    placeholder="손절·익절 기준과 실제 판단을 돌아보세요."
                    className="w-full resize-y rounded-2xl border border-line bg-elevated px-4 py-3 text-sm text-ink outline-none focus:border-brand"
                  />
                  <Button
                    type="button"
                    disabled={reflecting || answer.trim().length === 0}
                    onClick={() => void handleReflection()}
                  >
                    {reflecting ? '완료하는 중…' : '복기 저장하고 완료'}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {mutationError && <p className="text-sm text-loss">{mutationError}</p>}
    </div>
  )
}
