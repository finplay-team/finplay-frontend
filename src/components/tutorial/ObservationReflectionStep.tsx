// 3단계 튜토리얼 — 가격 관찰(손절·익절 경계 근접 판정)을 시간이 흐르며 자동으로 진행하고, 조건 충족 후 자유 복기를 남겨 완료를 확정하는 위젯
import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { TickPriceChart } from './TickPriceChart'
import { recordHoldingObservation, saveHoldingReflection } from '../../services/tutorialService'
import type { PracticeHoldingObservationResponse } from '../../services/tutorialTypes'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { toUserMessage } from '../../lib/errorMessages'
import { formatDateTime, parseLocalDateTime } from '../../lib/datetime'

const REFLECTION_MAX = 2000
const DEFAULT_PROMPT = '지금 팔고 싶나요? 그렇다면 왜 그런가요? 계획한 손절·익절 라인과 비교해 적어보세요.'
const TICK_MS = 2000
const CHART_POINTS = 10

const textareaClass =
  'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15'

function boundaryLabel(boundary: 'STOP_LOSS' | 'TAKE_PROFIT' | null): string {
  return boundary === 'STOP_LOSS' ? '손절' : '익절'
}

export function ObservationReflectionStep({
  holdingId,
  referenceStopLossPrice,
  referenceTakeProfitPrice,
  onCompleted,
  deferReflection = false,
}: {
  holdingId: number
  referenceStopLossPrice: number | null
  referenceTakeProfitPrice: number | null
  onCompleted: () => void
  /**
   * 샘플 종목 4단계 흐름(031)에서는 이 3단계가 관찰만 담당하고 복기는 4단계(SaleReflectionStep)로
   * 옮겨진다 — evidence A/B가 준비돼도 여기서 복기 폼을 보여주거나 저장하지 않는다.
   */
  deferReflection?: boolean
}) {
  const [observations, setObservations] = useState<PracticeHoldingObservationResponse[]>([])
  const [observeError, setObserveError] = useState<string | null>(null)
  const observeBusyRef = useRef(false)

  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)
  const submitBusyRef = useRef(false)

  const [completed, setCompleted] = useState<{ createdAt: string } | null>(null)

  const latest = observations[0] ?? null
  const canReflect = observations.some((o) => o.evidenceType !== null)

  // 사람이 클릭할 때마다 진행하는 대신, 손절·익절 참고선이 준비되면 시간이 흐르는 대로 자동으로
  // 가격을 관찰한다 — 조건을 충족하거나(canReflect) 복기를 이미 마치면 멈춘다.
  useEffect(() => {
    if (referenceStopLossPrice === null || referenceTakeProfitPrice === null) return
    if (canReflect || completed) return

    let cancelled = false
    const tick = () => {
      if (observeBusyRef.current || cancelled) return
      observeBusyRef.current = true
      recordHoldingObservation(holdingId)
        .then((res) => {
          if (cancelled) return
          setObservations((prev) => [res, ...prev])
          setObserveError(null)
          bumpTutorial()
        })
        .catch((e) => {
          if (!cancelled) {
            setObserveError(
              toUserMessage(e, {
                NOT_FOUND: '보유 종목을 찾을 수 없습니다.',
                PRACTICE_EVIDENCE_MISSING: '조건을 다시 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.',
              }),
            )
          }
        })
        .finally(() => {
          observeBusyRef.current = false
        })
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [holdingId, referenceStopLossPrice, referenceTakeProfitPrice, canReflect, completed])

  const trimmedAnswer = answer.trim()
  const canSubmit = canReflect && trimmedAnswer.length > 0 && trimmedAnswer.length <= REFLECTION_MAX && !submitting

  const handleSubmit = async () => {
    if (submitBusyRef.current) return
    if (trimmedAnswer.length === 0) {
      setReflectError('내용을 입력해 주세요.')
      return
    }
    submitBusyRef.current = true
    setSubmitting(true)
    setReflectError(null)
    try {
      const res = await saveHoldingReflection(holdingId, trimmedAnswer)
      setCompleted({ createdAt: res.createdAt })
      bumpTutorial()
      onCompleted()
    } catch (e) {
      setReflectError(
        toUserMessage(e, {
          PRACTICE_EVIDENCE_MISSING: '아직 관찰 조건을 충족하지 않았습니다. 가격을 다시 확인해 주세요.',
          PRACTICE_ALREADY_COMPLETED: '이미 완료된 실습입니다.',
        }),
      )
    } finally {
      submitBusyRef.current = false
      setSubmitting(false)
    }
  }

  if (completed) {
    return (
      <Card accent="brand">
        <div className="space-y-1 p-5">
          <p className="text-sm text-ink">복기를 저장했습니다. 3단계를 완료했습니다.</p>
          <p className="text-xs text-muted">{formatDateTime(completed.createdAt)}</p>
        </div>
      </Card>
    )
  }

  // referenceStopLossPrice·referenceTakeProfitPrice 는 유효 chain 이 있을 때만 함께 채워진다 —
  // 둘 다 null 이면 아직 서버에서 준비되지 않은 순간이다.
  if (referenceStopLossPrice === null || referenceTakeProfitPrice === null) {
    return (
      <Card accent="none">
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
        </div>
      </Card>
    )
  }

  // 세션 안에서 가장 먼저 한 관찰(배열은 최신이 앞이라 마지막 항목) 이후 몇 분이 지났는지.
  // 서버가 "몇 분 남았다"를 주지 않아 클라이언트가 대략 안내하는 용도로만 쓴다 — 정확한 판정은 서버가 한다.
  const oldest = observations.length > 0 ? observations[observations.length - 1] : null
  const minutesSinceOldest = oldest
    ? Math.max(0, Math.floor((Date.now() - parseLocalDateTime(oldest.observedAt).getTime()) / 60_000))
    : 0

  let verdict: string | null = null
  if (latest) {
    if (latest.evidenceType === 'CLOSER_TO_BOUNDARY') {
      verdict = `${boundaryLabel(latest.closerBoundary)} 경계에 가까워졌습니다. 지금 복기를 남길 수 있습니다.`
    } else if (latest.evidenceType === 'TIMED_REPETITION') {
      verdict = '2분 이상 간격으로 3번 관찰했습니다. 지금 복기를 남길 수 있습니다.'
    } else if (minutesSinceOldest < 2) {
      verdict = `아직 조건을 채우지 못했습니다. 관찰은 계속 자동으로 진행됩니다 — 2분 정도 기다리면 시간 분산 조건도 확인됩니다.`
    } else {
      verdict = '아직 조건을 채우지 못했습니다. 가격이 손절·익절 경계에 가까워질 때까지 자동으로 계속 확인합니다.'
    }
  }

  // 최신이 앞인 observations를 시간순으로 뒤집어 최근 10개만 그래프에 보여준다.
  const chartPrices = observations
    .slice(0, CHART_POINTS)
    .map((o) => o.currentPrice)
    .reverse()

  return (
    <div className="space-y-4">
      <Card accent="none">
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-muted">
            시세가 흐르며 자동으로 관찰됩니다. 가격이 손절선·익절선에 가까워지거나, 2분 이상 간격을 두고
            3번 이상 확인되면 복기를 쓸 수 있습니다.
          </p>

          <TickPriceChart
            prices={chartPrices}
            latest={latest?.currentPrice ?? null}
            referenceStopLoss={referenceStopLossPrice}
            referenceTakeProfit={referenceTakeProfitPrice}
            accent="brand"
          />

          {latest && (
            <>
              {verdict && <p className="text-sm text-ink">{verdict}</p>}
              <p className="text-xs text-muted tabular">지금까지 {observations.length}회 확인했습니다.</p>
            </>
          )}

          {observeError && <p className="text-sm text-loss">{observeError}</p>}
          {deferReflection && canReflect && (
            <p className="text-sm text-ink">
              조건을 충족했습니다. 다음 단계에서 매도하고 복기를 남기면 실습을 완료합니다.
            </p>
          )}
        </div>
      </Card>

      {!deferReflection && canReflect && (
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

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={REFLECTION_MAX}
              rows={5}
              placeholder={DEFAULT_PROMPT}
              className={`${textareaClass} resize-y`}
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
