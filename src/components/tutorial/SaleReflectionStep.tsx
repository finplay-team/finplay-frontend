// 튜토리얼 4단계(샘플 종목 전용) — 5분 안에 매도하고 복기를 남겨 실습을 완료한다
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { TickPriceChart } from './TickPriceChart'
import { parseLocalDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { useLiveSamplePrice } from '../../hooks/useLiveSamplePrice'
import { bumpAccount } from '../../lib/accountPulse'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { getHoldings } from '../../services/holdingService'
import { placeOrder } from '../../services/orderService'
import { saveHoldingReflection } from '../../services/tutorialService'
import type { Market } from '../../services/types'

const REFLECTION_MAX = 2000
/** 5분 매도 시한 전체를 그래프에 다 담는다 — 5분 ÷ 60틱 = 5초 간격. */
const SALE_WINDOW_TICK_MS = 5000
const SALE_WINDOW_MAX_POINTS = 60

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

  const idempotencyKey = useIdempotencyKey([market, instrumentId, holdingId])

  const handleSell = useCallback(async () => {
    setSelling(true)
    setSellError(null)
    try {
      const holdings = await getHoldings(market)
      const holding = holdings.find((h) => h.instrumentId === instrumentId)
      const sellable = holding ? Number(holding.quantity) - Number(holding.reservedQuantity) : 0
      if (!(sellable > 0)) {
        setSellError('매도 가능한 수량이 없습니다.')
        return
      }
      const res = await placeOrder(
        { market, instrumentId, side: 'SELL', orderType: 'MARKET', quantity: String(sellable) },
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
  }, [market, instrumentId, idempotencyKey])

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
              {sellError && <p className="text-sm text-loss">{sellError}</p>}
              <Button type="button" size="sm" disabled={selling} onClick={() => void handleSell()}>
                {selling ? '매도하는 중…' : '지금 시장가로 매도'}
              </Button>
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
