// 튜토리얼 2단계 — 매수 전 의도(수량·손절가·익절가) 기록과 실제 매수 체결을 한 화면에서 처리한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { TickPriceChart } from './TickPriceChart'
import { useLiveSamplePrice } from '../../hooks/useLiveSamplePrice'
import { formatDateTime, nowLocalDateTimeString } from '../../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { bumpAccount } from '../../lib/accountPulse'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { ensureInstrumentCache, getPrice } from '../../services/instrumentService'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import { createPracticeIntention, getSyntheticPrices } from '../../services/tutorialService'
import type { FavoriteResponse, PracticeIntentionResponse, SyntheticPriceSeriesResponse } from '../../services/tutorialTypes'
import type { LimitOrderResponse, Market, OrderExecutionResponse, PriceResponse } from '../../services/types'

/** 시장가·지정가 중 무엇을 골랐는지 — 지정가는 코인 실습에서만 고를 수 있다(백엔드가 코인 전용). */
type BuyOrderType = 'MARKET' | 'LIMIT'
/** 지정가 주문이 체결됐는지 폴링으로 확인하는 주기 — 관찰 단계 폴링과 같은 빈도. */
const LIMIT_POLL_MS = 3000

/** 값 한 칸. PostSellFeedback 의 Stat 과 같은 규칙. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-sm text-ink">{value}</dd>
    </div>
  )
}

/** 매수 확인 그래프 앞머리에 이어 붙일 참고 시세 꼬리 길이 — 너무 길면 실시간 틱 구간이 안 보인다. */
const REFERENCE_TAIL_POINTS = 20

function sanitizeNumberInput(value: string, allowDecimal: boolean): string {
  return value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '')
}

export function IntentionStep({
  market,
  favorite,
  intention,
  onIntentionCreated,
  onBought,
  resetToken = 0,
  simulateIntention = false,
}: {
  market: Market
  favorite: FavoriteResponse
  /** 아직 의도를 안 만들었으면 null — 부모(Tutorial.tsx)가 상태를 들고 있는다(페이지 이동해도 안 날아가게). */
  intention: PracticeIntentionResponse | null
  onIntentionCreated: (intention: PracticeIntentionResponse) => void
  /**
   * 실제 매수 체결 성공 시 호출 — 부모가 진행 상태를 다시 읽도록 트리거한다. priceHistory는 매수
   * 확인 화면에서 여기까지 이어 그린 시세(참고 시세 꼬리 + 실시간 틱)로, 3단계(관찰) 그래프가 0부터
   * 다시 시작하지 않고 이어지게 하는 용도일 뿐 evidence 판정과는 무관하다.
   */
  onBought: (execution?: OrderExecutionResponse, priceHistory?: number[]) => void
  /**
   * 샘플 종목 4단계(031)에서 5분 만료 후 "다시 시작"을 누르면 부모가 이 값을 증가시켜 매수 화면을
   * 다시 활성화한다 — 한 번 매수하면 영구히 "체결 완료" 카드로 고정되던 것을 되돌린다.
   */
  resetToken?: number
  /**
   * "다시 하기"(완료된 튜토리얼 재체험, TutorialReplay 참고)에서 true — 백엔드가 완료 후 의도 기록
   * API를 막으므로(409 PRACTICE_ALREADY_COMPLETED) 실제 호출 없이 로컬에서만 의도를 만든다.
   * 매수(handleBuy)는 이 모드에서도 항상 실제로 체결한다.
   */
  simulateIntention?: boolean
}) {
  const isCrypto = favorite.market === 'CRYPTO'
  const unit = isCrypto ? '개' : '주'

  const inputClass = `w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 ${
    isCrypto ? 'focus:border-coin focus:ring-4 focus:ring-coin/15' : 'focus:border-brand focus:ring-4 focus:ring-brand/15'
  }`

  /* ---------- 1단계 폼: 아직 의도가 없을 때 ---------- */
  const [quantity, setQuantity] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 코인 최소 주문금액 — 이 종목은 단가가 높아 "0.01개" 같은 흔한 기본값이 5,000원 미달로 거절될 수
  // 있다(예: 단가 10,000원 × 0.01개 = 100원). 클릭 전에 바로 알려주지 않으면 서버가 뭉뚱그린
  // "입력값을 다시 확인해 주세요."만 돌려줘서 원인을 알기 어렵다.
  const [minOrderAmount, setMinOrderAmount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    ensureInstrumentCache()
      .then((index) => {
        if (alive) setMinOrderAmount(index.byId.get(favorite.instrumentId)?.minOrderAmount ?? null)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [favorite.instrumentId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const q = Number(quantity)
    const sl = Number(stopLoss)
    const tp = Number(takeProfit)

    if (!quantity || !stopLoss || !takeProfit || !(q > 0) || !(sl > 0) || !(tp > 0)) {
      setFormError('수량·손절가·익절가를 모두 0보다 크게 입력해 주세요.')
      return
    }
    if (!isCrypto && !Number.isInteger(q)) {
      setFormError('주식 수량은 정수만 입력할 수 있습니다.')
      return
    }
    if (minOrderAmount !== null && priceInfo?.price != null && q * priceInfo.price < minOrderAmount) {
      setFormError(
        `주문금액이 최소 주문금액(${minOrderAmount.toLocaleString('ko-KR')}원)보다 적습니다. 수량을 늘려 주세요.`,
      )
      return
    }

    if (simulateIntention) {
      onIntentionCreated({
        intentionId: -1,
        instrumentId: favorite.instrumentId,
        quantity: q,
        stopLoss: sl,
        takeProfit: tp,
        createdAt: nowLocalDateTimeString(),
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await createPracticeIntention({
        instrumentId: favorite.instrumentId,
        quantity: q,
        stopLoss: sl,
        takeProfit: tp,
      })
      onIntentionCreated(res)
      bumpTutorial()
    } catch (err) {
      setFormError(
        toUserMessage(err, {
          PRACTICE_STEP_LOCKED: '먼저 이 종목을 즐겨찾기해야 합니다.',
          PRACTICE_ALREADY_COMPLETED: '이미 완료된 실습입니다.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- 2단계: 의도 요약 + 참고 시세 + 매수 확인 ---------- */
  const [prices, setPrices] = useState<SyntheticPriceSeriesResponse | null>(null)
  const [priceInfo, setPriceInfo] = useState<PriceResponse | null>(null)

  // 특히 코인은 종목마다 단가가 크게 달라 "수량 0.01" 같은 감으로 입력하면 최소 주문금액에
  // 못 미치는지 눈으로 바로 알기 어렵다 — 입력한 수량 × 현재가를 실시간으로 보여준다.
  const estimatedAmount = useMemo(() => {
    const q = Number(quantity)
    if (!quantity || !(q > 0) || priceInfo?.price == null) return null
    return q * priceInfo.price
  }, [quantity, priceInfo])
  const [priceError, setPriceError] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const [execution, setExecution] = useState<OrderExecutionResponse | null>(null)
  const [successNonce, setSuccessNonce] = useState(0)

  // 실제 거래 화면처럼 시장가·지정가를 직접 고른다 — 지정가는 백엔드가 코인 전용으로 제한한다.
  const [orderType, setOrderType] = useState<BuyOrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [limitOrder, setLimitOrder] = useState<LimitOrderResponse | null>(null)
  const [limitFilled, setLimitFilled] = useState(false)
  const [cancellingLimit, setCancellingLimit] = useState(false)
  const bought = execution !== null || limitFilled

  // 의도를 기록한 뒤부터(목표가는 참고선일 뿐, 자동 체결 트리거가 아니다) 흐르는 샘플 시세를 보며
  // 사용자가 직접 매수 시점을 고른다 — intention이 생기기 전이나 매수를 마친 뒤에는 굳이 틱을 돌리지 않는다.
  const live = useLiveSamplePrice(favorite.instrumentId, intention !== null && !bought)

  // 매수 확인 그래프가 실시간 틱(live.prices) 하나만으로 시작하면 점이 1~2개뿐이라 기울기가 안
  // 보인다 — 참고 시세의 꼬리를 앞에 이어 붙여 처음부터 하나의 연속된 그래프처럼 보이게 한다.
  const referenceTailPrices = useMemo(
    () => prices?.prices.slice(-REFERENCE_TAIL_POINTS) ?? [],
    [prices],
  )

  // resetToken이 바뀌면(4단계 5분 만료 후 "다시 시작") 매수 확인 화면을 다시 활성화한다.
  const lastResetTokenRef = useRef(resetToken)
  useEffect(() => {
    if (resetToken !== lastResetTokenRef.current) {
      lastResetTokenRef.current = resetToken
      setExecution(null)
      setBuyError(null)
      setLimitOrder(null)
      setLimitFilled(false)
      setOrderType('MARKET')
      setLimitPrice('')
    }
  }, [resetToken])

  const loadReferenceData = useCallback(() => {
    // 순수 참고용 미니 차트라 실패해도 조용히 생략한다(evidence 판정과 무관).
    getSyntheticPrices(favorite.instrumentId)
      .then(setPrices)
      .catch(() => undefined)

    setPriceError(null)
    getPrice(favorite.instrumentId)
      .then(setPriceInfo)
      .catch((err) => setPriceError(toUserMessage(err)))
  }, [favorite.instrumentId])

  // 의도를 기록하기 *전*에도 현재가를 보여줘야 한다 — 안 그러면 손절가·익절가를
  // 뭘로 적어야 할지 판단할 기준이 아예 없다.
  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  const idempotencyKey = useIdempotencyKey([
    market,
    favorite.instrumentId,
    intention?.intentionId,
    successNonce,
    orderType,
    limitPrice,
  ])

  async function handleBuy() {
    if (!intention) return
    setBuyError(null)
    setBuying(true)
    try {
      if (orderType === 'LIMIT') {
        const lp = Number(limitPrice)
        if (!(lp > 0)) {
          setBuyError('지정가를 입력해 주세요.')
          return
        }
        const res = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: favorite.instrumentId,
            side: 'BUY',
            quantity: String(intention.quantity),
            limitPrice: String(lp),
          },
          idempotencyKey,
        )
        setLimitOrder(res)
        bumpTutorial()
        return
      }
      const res = await placeOrder(
        {
          market,
          instrumentId: favorite.instrumentId,
          side: 'BUY',
          orderType: 'MARKET',
          quantity: String(intention.quantity),
        },
        idempotencyKey,
      )
      setExecution(res)
      setSuccessNonce((n) => n + 1)
      // 3단계(관찰) 그래프가 0부터 다시 시작하지 않도록, 지금까지 이어 그린 시세(참고 시세 꼬리 +
      // 매수 확인 중 흐른 실시간 틱)를 넘겨준다 — 부모가 이걸 관찰 그래프의 앞머리로 이어 붙인다.
      onBought(res, [...referenceTailPrices, ...live.prices])
      bumpTutorial()
      bumpAccount()
    } catch (err) {
      setBuyError(toUserMessage(err))
    } finally {
      setBuying(false)
    }
  }

  // 지정가 매수가 체결됐을 때 시장가 매수와 같은 완료 처리를 하는 공용 경로 — 폴링과 "이미 체결됨"
  // 취소 오류 양쪽에서 함께 쓴다.
  const handleLimitFilled = useCallback(() => {
    setLimitFilled(true)
    setSuccessNonce((n) => n + 1)
    onBought(undefined, [...referenceTailPrices, ...live.prices])
    bumpTutorial()
    bumpAccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBought, referenceTailPrices, live.prices])

  /**
   * 지정가는 접수 시점에 체결을 알 수 없다 — 체결 알림이 없어 미체결 목록 폴링이 유일한 감지
   * 수단이다(PendingOrders.tsx 와 같은 패턴). 목록에서 이 주문이 사라지면(직접 취소한 게 아니라면)
   * 체결됐다고 본다. 취소 시에는 handleCancelLimit 이 limitOrder 를 먼저 비워 이 폴링을 멈춘다.
   */
  useEffect(() => {
    if (!limitOrder) return
    let cancelled = false
    const poll = () => {
      getPendingOrders({ market: 'CRYPTO' })
        .then((page) => {
          if (cancelled) return
          const stillPending = page.content.some((o) => o.orderId === limitOrder.orderId)
          if (!stillPending) handleLimitFilled()
        })
        .catch(() => undefined)
    }
    const id = setInterval(poll, LIMIT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitOrder])

  async function handleCancelLimit() {
    if (!limitOrder || cancellingLimit) return
    setCancellingLimit(true)
    const orderId = limitOrder.orderId
    // 먼저 비워 위 폴링을 멈춘다 — 안 그러면 취소 응답이 오기 전 폴링이 "사라졌다 = 체결"로
    // 잘못 읽을 수 있다.
    setLimitOrder(null)
    try {
      await cancelLimitOrder(orderId)
      setBuyError(null)
    } catch (err) {
      if (isApiErrorCode(err, 'ORDER_ALREADY_FILLED')) {
        handleLimitFilled()
      } else {
        setBuyError(
          toUserMessage(err, { ORDER_ALREADY_CANCELLED: '이미 취소된 주문이에요.' }),
        )
      }
    } finally {
      setCancellingLimit(false)
    }
  }

  return (
    <Card accent={isCrypto ? 'coin' : 'brand'}>
      <div className="p-6">
        <Eyebrow>2단계 · 매수 전 의도 기록</Eyebrow>
        <h3 className="mt-2 font-display text-base font-semibold text-ink">
          {favorite.name}
          <span className="ml-2 text-xs font-normal text-muted">{favorite.symbol}</span>
        </h3>

        {intention === null ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* 손절가·익절가를 적으라고 하기 전에 기준이 될 현재가부터 보여준다 — 없으면 뭘 적어야 할지 알 수 없다. */}
            <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3 text-sm">
              <span className="text-muted">현재가</span>
              <span className="tabular text-ink">
                {priceError
                  ? priceError
                  : priceInfo?.price !== null && priceInfo?.price !== undefined
                    ? formatKRW(priceInfo.price)
                    : '조회 중…'}
              </span>
            </div>

            <div>
              <label htmlFor="intention-quantity" className="mb-1.5 block text-sm font-medium text-ink">
                수량
              </label>
              <input
                id="intention-quantity"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={isCrypto ? '0.01' : '1'}
                value={quantity}
                onChange={(e) => setQuantity(sanitizeNumberInput(e.target.value, isCrypto))}
                className={inputClass}
              />
              <span className="mt-1.5 block text-xs text-muted">
                {unit} 단위로 입력합니다.
                {minOrderAmount != null && ` 최소 주문금액 ${minOrderAmount.toLocaleString('ko-KR')}원 이상이어야 합니다.`}
              </span>
              {estimatedAmount != null && (
                <p
                  className={`mt-1 text-xs ${
                    minOrderAmount != null && estimatedAmount < minOrderAmount ? 'text-loss' : 'text-muted'
                  }`}
                >
                  예상 주문금액 {formatKRW(estimatedAmount)} (현재가 × 수량 — 실제 체결가는 매수 시점 시세로 확정됩니다)
                </p>
              )}
            </div>
            <div>
              <label htmlFor="intention-stop-loss" className="mb-1.5 block text-sm font-medium text-ink">
                손절가
              </label>
              <input
                id="intention-stop-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={stopLoss}
                onChange={(e) => setStopLoss(sanitizeNumberInput(e.target.value, true))}
                className={inputClass}
              />
              {priceInfo?.price != null && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[5, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setStopLoss(String(Math.round(priceInfo.price! * (1 - pct / 100))))}
                      className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink"
                    >
                      현재가 -{pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="intention-take-profit" className="mb-1.5 block text-sm font-medium text-ink">
                익절가
              </label>
              <input
                id="intention-take-profit"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={takeProfit}
                onChange={(e) => setTakeProfit(sanitizeNumberInput(e.target.value, true))}
                className={inputClass}
              />
              {priceInfo?.price != null && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[5, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTakeProfit(String(Math.round(priceInfo.price! * (1 + pct / 100))))}
                      className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink"
                    >
                      현재가 +{pct}%
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                손절가는 "이 가격까지 떨어지면 더 손해 보기 전에 팔자"라고 미리 정해두는 약속 가격이에요.
                익절가는 반대로 "이만큼 올랐으면 만족하고 팔자"라고 정해두는 가격이에요. 지금 바로 파는 게
                아니라, 나중에 가격이 흘러가는 걸 보면서 판단할 때 쓰는 기준이에요. 버튼을 누르면 지금
                가격을 기준으로 자동으로 채워지고, 원하는 숫자로 직접 바꿀 수도 있어요.
              </p>
            </div>

            {formError && <p className="text-sm text-rose-300">{formError}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? '기록하는 중…' : '의도 기록하기'}
            </Button>
          </form>
        ) : (
          <div className="mt-5">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Stat label="수량" value={`${intention.quantity.toLocaleString('ko-KR')}${unit}`} />
              <Stat label="손절가" value={formatKRW(intention.stopLoss)} />
              <Stat label="익절가" value={formatKRW(intention.takeProfit)} />
              <Stat label="기록 시각" value={formatDateTime(intention.createdAt)} />
            </dl>

            {!bought ? (
              <div className="mt-5 rounded-xl bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">매수 확인</p>
                <div className="mt-3">
                  {/*
                    실시간 틱(live.prices)만 그리면 처음엔 점 하나뿐이라 기울기가 안 보인다 — 의도를
                    기록하기 전부터 보여준 참고 시세(prices.prices) 뒤쪽 구간을 이어 붙여, 하나의
                    연속된 그래프처럼 보이게 한다. 뒤쪽(연습용 참고 자료)만 진짜가 아니고 그 앞
                    구간은 여전히 연습용 합성 시세다.
                  */}
                  <TickPriceChart
                    prices={[...referenceTailPrices, ...live.prices]}
                    latest={live.latest ?? referenceTailPrices[referenceTailPrices.length - 1] ?? null}
                    referenceStopLoss={intention.stopLoss}
                    referenceTakeProfit={intention.takeProfit}
                  />
                </div>

                {!limitOrder && (
                  <>
                    {/* 실제 거래 화면처럼 시장가·지정가를 직접 고른다 — 설명은 바로 아래에 붙인다. */}
                    {isCrypto ? (
                      <div className="mt-4">
                        <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                          {(
                            [
                              ['MARKET', '시장가'],
                              ['LIMIT', '지정가'],
                            ] as const
                          ).map(([value, label]) => {
                            const active = orderType === value
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setOrderType(value)}
                                aria-pressed={active}
                                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                                  active ? 'bg-coin-soft text-coin ring-1 ring-coin/40' : 'text-muted hover:text-ink'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted">
                          시장가는 지금 바로 이 가격에 사는 거예요. 지정가는 "이 가격이 되면 사겠다"고
                          미리 정해두고 기다리는 거예요 — 내가 정한 가격이 되면 그때 자동으로 체결돼요.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-[11px] leading-relaxed text-muted">
                        이 실습에서 주식은 시장가로만 살 수 있어요(실제 거래 화면도 주식은 시장가만
                        지원해요). 시장가는 지금 바로 이 가격에 사는 거예요.
                      </p>
                    )}

                    {orderType === 'LIMIT' && (
                      <div className="mt-3">
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <label htmlFor="intention-limit-price" className="text-sm font-medium text-ink">
                            지정가 (원)
                          </label>
                          {priceInfo?.price != null && (
                            <button
                              type="button"
                              onClick={() => setLimitPrice(String(priceInfo.price))}
                              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-coin transition-colors hover:bg-white/[0.1]"
                            >
                              현재가 {formatKRW(priceInfo.price)}
                            </button>
                          )}
                        </div>
                        <input
                          id="intention-limit-price"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          value={limitPrice}
                          onChange={(e) => setLimitPrice(sanitizeNumberInput(e.target.value, true))}
                          className={inputClass}
                        />
                        <p className="mt-2 text-[11px] leading-relaxed text-muted">
                          지금 가격보다 낮게 정하면, 가격이 그만큼 떨어져야 체결돼요. 이 실습 시간 안에
                          그 가격까지 안 내려오면 체결되지 않을 수도 있어요 — 그래도 괜찮으니 편하게
                          골라보세요.
                        </p>
                      </div>
                    )}

                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      손절가·익절가는 참고선일 뿐 자동으로 체결시키지 않습니다. 시세가 흐르는 걸 보다가
                      원할 때 직접 매수 버튼을 눌러 주세요. 왼쪽 구간은 연습용 참고 자료이며, 실제 시세가
                      아닙니다.
                    </p>
                    {buyError && <p className="mt-2 text-sm text-rose-300">{buyError}</p>}
                    <Button type="button" className="mt-3" disabled={buying} onClick={() => void handleBuy()}>
                      {buying
                        ? '주문 처리 중…'
                        : orderType === 'LIMIT'
                          ? `${intention.quantity.toLocaleString('ko-KR')}${unit} 지정가로 주문 넣기`
                          : `${intention.quantity.toLocaleString('ko-KR')}${unit} 시장가로 매수`}
                    </Button>
                  </>
                )}

                {limitOrder && (
                  <div className="mt-4 rounded-xl border border-coin/30 bg-coin-soft/40 p-4">
                    <p className="text-sm font-medium text-coin">
                      지정가 매수 주문을 넣었어요. {formatKRW(Number(limitOrder.limitPrice))}이 되면
                      자동으로 체결돼요.
                    </p>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Stat label="지정가" value={formatKRW(Number(limitOrder.limitPrice))} />
                      <Stat label="수량" value={`${limitOrder.quantity.toLocaleString('ko-KR')}${unit}`} />
                    </dl>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      체결될 때까지 기다리는 중이에요. 마음이 바뀌었으면 아래 버튼으로 취소하고 다시
                      정할 수 있어요.
                    </p>
                    {buyError && <p className="mt-2 text-sm text-rose-300">{buyError}</p>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      disabled={cancellingLimit}
                      onClick={() => void handleCancelLimit()}
                    >
                      {cancellingLimit ? '취소하는 중…' : '취소하고 다시 정하기'}
                    </Button>
                  </div>
                )}
              </div>
            ) : execution !== null ? (
              <div className="mt-5 rounded-xl bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">
                  {formatDateTime(execution.executedAt)}, {execution.quantity.toLocaleString('ko-KR')}
                  {unit} 매수를 체결했습니다.
                </p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Stat label="체결단가" value={formatKRW(execution.price)} />
                  <Stat label="수량" value={`${execution.quantity.toLocaleString('ko-KR')}${unit}`} />
                  <Stat label="체결금액" value={formatKRW(execution.amount)} />
                  <Stat label="수수료" value={formatKRW(execution.fee)} />
                </dl>
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">지정가 매수가 체결됐습니다.</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  정한 가격에 도달해 자동으로 체결됐어요. 정확한 체결가·수수료는 투자일기·체결내역에서
                  확인할 수 있어요.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
