// 튜토리얼 4단계(샘플 종목 전용) — 5분 안에 매도하고 복기를 남겨 실습을 완료한다
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { TickPriceChart } from './TickPriceChart'
import { parseLocalDateTime } from '../../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { useLiveSamplePrice } from '../../hooks/useLiveSamplePrice'
import { bumpAccount } from '../../lib/accountPulse'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import { saveHoldingReflection } from '../../services/tutorialService'
import type { LimitOrderResponse, Market } from '../../services/types'

const REFLECTION_MAX = 2000
/** 5분 매도 시한 전체를 그래프에 다 담는다 — 5분 ÷ 60틱 = 5초 간격. */
const SALE_WINDOW_TICK_MS = 5000
const SALE_WINDOW_MAX_POINTS = 60
/** 지정가 매도가 체결됐는지 폴링으로 확인하는 주기 — IntentionStep의 지정가 매수 폴링과 같은 빈도. */
const LIMIT_POLL_MS = 3000
/** 시장가·지정가 중 무엇을 골랐는지 — 지정가는 코인 실습에서만 고를 수 있다(백엔드가 코인 전용). */
type SellOrderType = 'MARKET' | 'LIMIT'

/** 소수점을 두 번째부터는 지운다("1.2.3" 같은 값이 그대로 남아 Number() 가 NaN이 되는 걸 막는다). */
function sanitizeDecimalInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SaleReflectionStep({
  market,
  instrumentId,
  holdingId,
  expired,
  saleDeadlineAt,
  sellTradeId,
  hasObservationEvidence,
  referenceStopLossPrice,
  referenceTakeProfitPrice,
  onCompleted,
  onRetry,
  simulate = false,
  initialPrices = [],
  quantity,
}: {
  market: Market
  instrumentId: number
  holdingId: number
  /** 서버 status가 EXPIRED면 true — 5분을 넘겨 매도 없이 만료됨(031 SANDBOX-007) */
  expired: boolean
  saleDeadlineAt: string | null
  sellTradeId: number | null
  /** 2단계에서 기록한 참고용 손절가·익절가 — 매도 체결가와 얼마나 차이 났는지 보여주는 데만 쓴다. */
  referenceStopLossPrice: number | null
  referenceTakeProfitPrice: number | null
  /**
   * 3단계 evidence A/B(경계 접근·시간 분산)가 이미 충족됐는지 — holding-reflections는 매도 체결과
   * 무관하게 이 조건도 함께 요구한다(026 원칙 상속). 미충족 상태로 저장을 시도하면 매도와는 무관한
   * 409 PRACTICE_EVIDENCE_MISSING이 나서, 매도만 확인한 사용자에게는 원인이 헷갈릴 수 있어
   * 버튼 자체를 막고 안내한다.
   */
  hasObservationEvidence: boolean
  onCompleted: () => void
  /** 5분 만료(timedOut) 화면의 "다시 시작" 클릭 시 호출 — 부모가 2단계 매수 화면을 다시 열어준다. */
  onRetry: () => void
  /**
   * "다시 하기"(TutorialReplay)에서 true — 백엔드가 완료 후 복기 API를 막으므로(409
   * PRACTICE_ALREADY_COMPLETED) 실제 호출 없이 로컬로만 복기를 완료 처리한다. 매도(handleSell)는
   * 이 모드에서도 항상 실제로 체결한다.
   */
  simulate?: boolean
  /**
   * 3단계(관찰)에서 여기까지 이어 그린 시세 — 그래프가 0부터 다시 시작하지 않도록 앞머리에 붙일 뿐,
   * 판정에는 쓰이지 않는다.
   */
  initialPrices?: number[]
  /**
   * 2단계에서 매수한 수량 — GET /api/holdings 로 매도 가능 수량을 확인할 수 없다(샌드박스 종목
   * holding은 그 응답에서 항상 빠진다, 033-exclude-tutorial-sandbox-data). 매수 직후 이 값이
   * 부모(Tutorial.tsx)의 세션 상태로 전달되며, 새로고침하면 사라진다(의도 기록과 같은 한계) — 그
   * 경우 null이고, handleSell이 매도 자체를 막고 안내한다.
   */
  quantity: number | null
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const [sold, setSold] = useState(sellTradeId !== null)
  const live = useLiveSamplePrice(instrumentId, !sold && !expired, {
    tickMs: SALE_WINDOW_TICK_MS,
    maxPoints: SALE_WINDOW_MAX_POINTS,
  })

  const [selling, setSelling] = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const [sellPrice, setSellPrice] = useState<number | null>(null)

  // 실제 거래 화면처럼 시장가·지정가를 직접 고른다 — 지정가는 백엔드가 코인 전용으로 제한한다.
  const [orderType, setOrderType] = useState<SellOrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [limitOrder, setLimitOrder] = useState<LimitOrderResponse | null>(null)
  const [cancellingLimit, setCancellingLimit] = useState(false)

  const idempotencyKey = useIdempotencyKey([market, instrumentId, holdingId, orderType, limitPrice])

  const handleSell = useCallback(async () => {
    // quantity가 없으면(새로고침 등으로 매수 수량을 잃어버린 경우) 매도 자체를 시도하지 않는다 —
    // GET /api/holdings 는 샌드박스 종목 holding을 항상 빼고 돌려줘 대안이 될 수 없다
    // (033-exclude-tutorial-sandbox-data). 버튼도 이 경우 비활성화된다(아래 렌더 참고).
    if (quantity === null) {
      setSellError('매수 수량 정보를 잃어버렸어요. 처음부터 다시 시작해 주세요.')
      return
    }
    setSelling(true)
    setSellError(null)
    try {
      if (orderType === 'LIMIT') {
        const lp = Number(limitPrice)
        if (!(lp > 0)) {
          setSellError('지정가를 입력해 주세요.')
          return
        }
        const res = await placeLimitOrder(
          { market: 'CRYPTO', instrumentId, side: 'SELL', quantity: String(quantity), limitPrice: String(lp) },
          idempotencyKey,
        )
        setLimitOrder(res)
        bumpTutorial()
        return
      }
      const res = await placeOrder(
        { market, instrumentId, side: 'SELL', orderType: 'MARKET', quantity: String(quantity) },
        idempotencyKey,
      )
      setSellPrice(res.price)
      setSold(true)
      bumpTutorial()
      bumpAccount()
    } catch (e) {
      setSellError(toUserMessage(e))
    } finally {
      setSelling(false)
    }
  }, [market, instrumentId, idempotencyKey, orderType, limitPrice, quantity])

  // 지정가 매도가 체결됐을 때 시장가 매도와 같은 완료 처리를 하는 공용 경로 — 폴링과 "이미 체결됨"
  // 취소 오류 양쪽에서 함께 쓴다. 체결가는 접수 응답에 담기지 않아 sellPrice 는 null 로 남는다
  // (targetDiff 계산은 sellPrice === null 이면 조용히 생략한다). limitOrder 를 반드시 비워야 아래
  // 폴링이 멈춘다 — 안 비우면 이미 사라진 주문을 매번 다시 "체결됐다"로 읽어 bumpTutorial·
  // bumpAccount 가 계속 반복 호출된다.
  const handleLimitFilled = useCallback(() => {
    setLimitOrder(null)
    setSold(true)
    bumpTutorial()
    bumpAccount()
  }, [])

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
  }, [limitOrder, handleLimitFilled])

  const handleCancelLimit = useCallback(async () => {
    if (!limitOrder || cancellingLimit) return
    setCancellingLimit(true)
    const order = limitOrder
    // 먼저 비워 위 폴링을 멈춘다 — 안 그러면 취소 응답이 오기 전 폴링이 "사라졌다 = 체결"로
    // 잘못 읽을 수 있다.
    setLimitOrder(null)
    try {
      await cancelLimitOrder(order.orderId)
      setSellError(null)
    } catch (e) {
      if (isApiErrorCode(e, 'ORDER_ALREADY_FILLED')) {
        handleLimitFilled()
      } else if (isApiErrorCode(e, 'ORDER_ALREADY_CANCELLED')) {
        setSellError('이미 취소된 주문이에요.')
      } else {
        // 취소 요청 자체가 실패했다면(네트워크 오류 등) 주문은 여전히 서버에 살아있다 — 화면에서마저
        // 지워버리면 사용자가 같은 주문을 또 넣어 중복 주문이 생길 수 있다. 원래 상태로 되돌린다.
        setLimitOrder(order)
        setSellError(toUserMessage(e))
      }
    } finally {
      setCancellingLimit(false)
    }
  }, [limitOrder, cancellingLimit, handleLimitFilled])

  // 매도 체결가가 참고 손절가·익절가 중 어느 쪽에 더 가까웠는지 — 목표가 대비 차이를 보여주는 용도일
  // 뿐, 판정에는 쓰이지 않는다.
  const targetDiff = useMemo(() => {
    if (sellPrice === null) return null
    const candidates: { label: string; target: number }[] = []
    if (referenceStopLossPrice !== null) candidates.push({ label: '손절가', target: referenceStopLossPrice })
    if (referenceTakeProfitPrice !== null) candidates.push({ label: '익절가', target: referenceTakeProfitPrice })
    if (candidates.length === 0) return null
    const nearest = candidates.reduce((a, b) => (Math.abs(sellPrice - a.target) <= Math.abs(sellPrice - b.target) ? a : b))
    return { label: nearest.label, diff: sellPrice - nearest.target }
  }, [sellPrice, referenceStopLossPrice, referenceTakeProfitPrice])

  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)

  const trimmedAnswer = answer.trim()
  const canSubmit =
    sold &&
    hasObservationEvidence &&
    trimmedAnswer.length > 0 &&
    trimmedAnswer.length <= REFLECTION_MAX &&
    !submitting

  const handleSubmit = useCallback(async () => {
    if (trimmedAnswer.length === 0) {
      setReflectError('내용을 입력해 주세요.')
      return
    }
    setSubmitting(true)
    setReflectError(null)
    if (simulate) {
      setSubmitting(false)
      onCompleted()
      return
    }
    try {
      await saveHoldingReflection(holdingId, trimmedAnswer)
      bumpTutorial()
      onCompleted()
    } catch (e) {
      setReflectError(
        toUserMessage(e, {
          PRACTICE_EVIDENCE_MISSING: '아직 관찰 조건(3단계)을 채우지 못했습니다. 가격을 다시 확인해 주세요.',
          PRACTICE_SANDBOX_TIME_EXPIRED: '5분이 지나 만료됐습니다. 다시 매수해서 재도전해 주세요.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }, [trimmedAnswer, holdingId, onCompleted, simulate])

  const deadlineMs = saleDeadlineAt ? parseLocalDateTime(saleDeadlineAt).getTime() : null
  const remainingSeconds = deadlineMs === null ? null : Math.max(0, Math.floor((deadlineMs - nowMs) / 1000))
  const timedOut = expired || (remainingSeconds !== null && remainingSeconds <= 0 && !sold)

  // 5분 시한이 끝나 "다시 시작" 화면으로 넘어가면서도 아직 체결 안 된 지정가 주문이 남아있다면,
  // 화면만 넘어가고 서버 주문은 계속 살아있게 된다 — 최선을 다해 취소한다(실패해도 화면 전환은 막지 않는다).
  useEffect(() => {
    if (timedOut && limitOrder) cancelLimitOrder(limitOrder.orderId).catch(() => undefined)
  }, [timedOut, limitOrder])

  if (timedOut) {
    return (
      <Card accent="none">
        <div className="space-y-3 p-5">
          <p className="text-sm text-ink">시간이 끝났습니다 — 5분 안에 매도하지 못해 만료됐습니다.</p>
          <p className="text-xs text-muted">
            다시 시작을 누르면 매수 화면으로 돌아가 같은 종목으로 새로 도전할 수 있습니다.
          </p>
          <Button type="button" size="sm" onClick={onRetry}>
            다시 시작
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card accent="none">
        <div className="space-y-3 p-5">
          {!sold && remainingSeconds !== null && (
            <p className="tabular text-sm text-ink">매도까지 남은 시간 {formatRemaining(remainingSeconds)}</p>
          )}
          {sold ? (
            <>
              <p className="text-sm text-ink">매도를 체결했습니다.</p>
              {targetDiff && (
                <p className="text-xs text-muted">
                  {targetDiff.label} 대비 {targetDiff.diff >= 0 ? '+' : ''}
                  {formatKRW(targetDiff.diff)} 차이로 매도했습니다.
                </p>
              )}
            </>
          ) : (
            <>
              <TickPriceChart
                prices={[...initialPrices, ...live.prices]}
                latest={live.latest ?? initialPrices[initialPrices.length - 1] ?? null}
              />
              <p className="text-[11px] leading-relaxed text-muted">
                목표가는 참고선일 뿐입니다. 시세가 흐르는 걸 보다가 원할 때 직접 매도해 주세요.
              </p>

              {quantity === null && (
                <div className="space-y-2">
                  <p className="text-sm text-loss">
                    매수 수량 정보를 잃어버렸어요(새로고침 등으로 인한 것으로 보여요). 처음부터 다시
                    시작해 주세요.
                  </p>
                  <Button type="button" size="sm" variant="soft" onClick={onRetry}>
                    처음부터 다시 시작
                  </Button>
                </div>
              )}

              {!limitOrder && (
                <>
                  {/* 실제 거래 화면처럼 시장가·지정가를 직접 고른다 — 설명은 바로 아래에 붙인다. */}
                  {market === 'CRYPTO' ? (
                    <div>
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
                        시장가는 지금 바로 이 가격에 파는 거예요. 지정가는 "이 가격이 되면 팔겠다"고
                        미리 정해두고 기다리는 거예요.
                      </p>
                      {orderType === 'LIMIT' && (
                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-loss">
                          지정가는 체결이 늦어질 수 있어요 — 5분 안에 체결되지 않으면 이번 실습은
                          다시 시작해야 해요. 그래도 괜찮으면 편하게 골라보세요.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted">
                      이 실습에서 주식은 시장가로만 팔 수 있어요(실제 거래 화면도 주식은 시장가만
                      지원해요).
                    </p>
                  )}

                  {orderType === 'LIMIT' && (
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <label htmlFor="sale-limit-price" className="text-sm font-medium text-ink">
                          지정가 (원)
                        </label>
                        {live.latest != null && (
                          <button
                            type="button"
                            onClick={() => setLimitPrice(String(live.latest))}
                            className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-coin transition-colors hover:bg-white/[0.1]"
                          >
                            현재가 {formatKRW(live.latest)}
                          </button>
                        )}
                      </div>
                      <input
                        id="sale-limit-price"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(sanitizeDecimalInput(e.target.value))}
                        className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-coin focus:ring-4 focus:ring-coin/15"
                      />
                    </div>
                  )}

                  {sellError && <p className="text-sm text-loss">{sellError}</p>}
                  <Button
                    type="button"
                    size="sm"
                    disabled={selling || quantity === null}
                    onClick={() => void handleSell()}
                  >
                    {selling
                      ? '주문 처리 중…'
                      : orderType === 'LIMIT'
                        ? '지정가로 주문 넣기'
                        : '지금 시장가로 매도'}
                  </Button>
                </>
              )}

              {limitOrder && (
                <div className="rounded-xl border border-coin/30 bg-coin-soft/40 p-4">
                  <p className="text-sm font-medium text-coin">
                    지정가 매도 주문을 넣었어요. {formatKRW(Number(limitOrder.limitPrice))}이 되면
                    자동으로 체결돼요.
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    체결될 때까지 기다리는 중이에요. 5분 시한 안에 체결되지 않으면 이번 실습은 다시
                    시작해야 해요. 마음이 바뀌었으면 아래 버튼으로 취소하고 다시 정할 수 있어요.
                  </p>
                  {sellError && <p className="mt-2 text-sm text-loss">{sellError}</p>}
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
            </>
          )}
        </div>
      </Card>

      {sold && (
        <Card accent="none">
          <div className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink">자유 복기</span>
              <span
                className={`text-[11px] tabular ${trimmedAnswer.length > REFLECTION_MAX ? 'text-loss' : 'text-muted'}`}
              >
                {answer.length.toLocaleString('ko-KR')}/{REFLECTION_MAX.toLocaleString('ko-KR')}
              </span>
            </div>
            {!hasObservationEvidence && (
              <p className="text-xs leading-relaxed text-muted">
                3단계에서 가격이 손절·익절 경계에 가까워지거나 2분 이상 간격으로 3번 확인하면 복기를
                저장할 수 있습니다.
              </p>
            )}
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={REFLECTION_MAX}
              rows={5}
              placeholder="이번 매수~매도까지 어떤 판단을 했는지 적어보세요."
              className="w-full resize-y rounded-2xl border border-line bg-elevated px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            {reflectError && <p className="text-sm text-loss">{reflectError}</p>}
            <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void handleSubmit()}>
              {submitting ? '저장 중…' : '저장'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
