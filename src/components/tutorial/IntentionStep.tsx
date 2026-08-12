// 튜토리얼 2단계 — 매수 전 의도(수량·손절가·익절가) 기록과 실제 매수 체결을 한 화면에서 처리한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { TickPriceChart } from './TickPriceChart'
import { useLiveSamplePrice } from '../../hooks/useLiveSamplePrice'
import { formatDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { bumpAccount } from '../../lib/accountPulse'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { getPrice } from '../../services/instrumentService'
import { placeOrder } from '../../services/orderService'
import { createPracticeIntention, getSyntheticPrices } from '../../services/tutorialService'
import type { FavoriteResponse, PracticeIntentionResponse, SyntheticPriceSeriesResponse } from '../../services/tutorialTypes'
import type { Market, OrderExecutionResponse, PriceResponse } from '../../services/types'

/** 값 한 칸. PostSellFeedback 의 Stat 과 같은 규칙. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-sm text-ink">{value}</dd>
    </div>
  )
}

/** 100개 점을 0~100 폭에 균등 배치하고 min/max 로 세로 정규화하는 아주 작은 스파크라인. */
function Sparkline({ prices, accent }: { prices: number[]; accent: 'brand' | 'coin' }) {
  const points = useMemo(() => {
    if (prices.length === 0) return ''
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const span = max - min || 1
    return prices
      .map((p, i) => {
        const x = (i / (prices.length - 1)) * 100
        const y = 100 - ((p - min) / span) * 100
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }, [prices])

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`mt-2 h-16 w-full ${accent === 'coin' ? 'text-coin' : 'text-brand'}`}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

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
}: {
  market: Market
  favorite: FavoriteResponse
  /** 아직 의도를 안 만들었으면 null — 부모(Tutorial.tsx)가 상태를 들고 있는다(페이지 이동해도 안 날아가게). */
  intention: PracticeIntentionResponse | null
  onIntentionCreated: (intention: PracticeIntentionResponse) => void
  /**
   * 실제 매수 체결 성공 시 호출 — 부모가 진행 상태를 다시 읽도록 트리거한다.
   * 코인 지정가 체결 경로(CoinPriceSessionBuyStep)는 체결 정보를 따로 갖고 있지 않아 인자 없이 부른다.
   */
  onBought: (execution?: OrderExecutionResponse) => void
  /**
   * 샘플 종목 4단계(031)에서 5분 만료 후 "다시 시작"을 누르면 부모가 이 값을 증가시켜 매수 화면을
   * 다시 활성화한다 — 한 번 매수하면 영구히 "체결 완료" 카드로 고정되던 것을 되돌린다.
   */
  resetToken?: number
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
  const [priceError, setPriceError] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const [execution, setExecution] = useState<OrderExecutionResponse | null>(null)
  const [successNonce, setSuccessNonce] = useState(0)
  // 의도를 기록한 뒤부터(목표가는 참고선일 뿐, 자동 체결 트리거가 아니다) 흐르는 샘플 시세를 보며
  // 사용자가 직접 매수 시점을 고른다 — intention이 생기기 전에는 굳이 틱을 돌리지 않는다.
  const live = useLiveSamplePrice(favorite.instrumentId, intention !== null && execution === null)

  // resetToken이 바뀌면(4단계 5분 만료 후 "다시 시작") 매수 확인 화면을 다시 활성화한다.
  const lastResetTokenRef = useRef(resetToken)
  useEffect(() => {
    if (resetToken !== lastResetTokenRef.current) {
      lastResetTokenRef.current = resetToken
      setExecution(null)
      setBuyError(null)
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

  const idempotencyKey = useIdempotencyKey([market, favorite.instrumentId, intention?.intentionId, successNonce])

  async function handleBuy() {
    if (!intention) return
    setBuyError(null)
    setBuying(true)
    try {
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
      onBought(res)
      bumpTutorial()
      bumpAccount()
    } catch (err) {
      setBuyError(toUserMessage(err))
    } finally {
      setBuying(false)
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
              <span className="mt-1.5 block text-xs text-muted">{unit} 단위로 입력합니다.</span>
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
                손절가는 이 아래로 내려가면 판다고 정하는 가격, 익절가는 이 위로 오르면 판다고 정하는
                가격입니다. 버튼을 눌러 현재가 기준으로 채우고 원하는 값으로 고쳐도 됩니다.
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

            <div className="mt-5 rounded-xl bg-elevated p-4">
              <p className="text-xs text-muted">{prices?.title ?? '참고 시세'}</p>
              {prices ? (
                <Sparkline prices={prices.prices} accent={isCrypto ? 'coin' : 'brand'} />
              ) : (
                <div className="skeleton mt-2 h-16" />
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                이건 실제 시세가 아니라 연습용 참고 자료입니다.
              </p>
            </div>

            {execution === null ? (
              <div className="mt-5 rounded-xl bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">매수 확인</p>
                <div className="mt-3">
                  <TickPriceChart
                    prices={live.prices}
                    latest={live.latest}
                    referenceStopLoss={intention.stopLoss}
                    referenceTakeProfit={intention.takeProfit}
                    accent={isCrypto ? 'coin' : 'brand'}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  손절가·익절가는 참고선일 뿐 자동으로 체결시키지 않습니다. 시세가 흐르는 걸 보다가
                  원할 때 직접 매수 버튼을 눌러 주세요.
                </p>
                {buyError && <p className="mt-2 text-sm text-rose-300">{buyError}</p>}
                <Button type="button" className="mt-3" disabled={buying} onClick={() => void handleBuy()}>
                  {buying ? '매수하는 중…' : `${intention.quantity.toLocaleString('ko-KR')}${unit} 시장가로 매수`}
                </Button>
              </div>
            ) : (
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
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
