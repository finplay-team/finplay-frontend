// 3단계 튜토리얼 — 가격 관찰(손절·익절 경계 근접 판정) 후 자유 복기를 남겨 완료를 확정하는 위젯
import { useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { PriceGauge } from './PriceGauge'
import { recordHoldingObservation, saveHoldingReflection } from '../../services/tutorialService'
import type { PracticeHoldingObservationResponse } from '../../services/tutorialTypes'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { toUserMessage } from '../../lib/errorMessages'
import { formatDateTime, parseLocalDateTime } from '../../lib/datetime'

const REFLECTION_MAX = 2000
const DEFAULT_PROMPT = '지금 팔고 싶나요? 그렇다면 왜 그런가요? 계획한 손절·익절 라인과 비교해 적어보세요.'

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
}: {
  holdingId: number
  referenceStopLossPrice: number | null
  referenceTakeProfitPrice: number | null
  onCompleted: () => void
}) {
  const [observations, setObservations] = useState<PracticeHoldingObservationResponse[]>([])
  const [observing, setObserving] = useState(false)
  const [observeError, setObserveError] = useState<string | null>(null)
  const observeBusyRef = useRef(false)

  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)
  const submitBusyRef = useRef(false)

  const [completed, setCompleted] = useState<{ createdAt: string } | null>(null)

  const latest = observations[0] ?? null
  const canReflect = observations.some((o) => o.evidenceType !== null)

  const handleObserve = async () => {
    if (observeBusyRef.current || referenceStopLossPrice === null || referenceTakeProfitPrice === null) return
    observeBusyRef.current = true
    setObserving(true)
    setObserveError(null)
    try {
      const res = await recordHoldingObservation(holdingId)
      setObservations((prev) => [res, ...prev])
      bumpTutorial()
    } catch (e) {
      setObserveError(
        toUserMessage(e, {
          NOT_FOUND: '보유 종목을 찾을 수 없습니다.',
          PRACTICE_EVIDENCE_MISSING: '조건을 다시 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        }),
      )
    } finally {
      observeBusyRef.current = false
      setObserving(false)
    }
  }

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
          <Button type="button" size="sm" disabled>
            지금 가격 확인하기
          </Button>
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
      verdict = `아직 조건을 채우지 못했습니다. 첫 확인 이후 ${minutesSinceOldest}분 지났습니다 — 연달아 눌러도 시간이 안 쌓이니, 2분 정도 기다렸다가 다시 눌러보세요.`
    } else {
      verdict = '아직 조건을 채우지 못했습니다. 가격이 손절·익절 경계에 더 가까워질 때까지 몇 분 간격으로 다시 확인해 보세요.'
    }
  }

  return (
    <div className="space-y-4">
      <Card accent="none">
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-muted">
            둘 중 하나를 채우면 복기를 쓸 수 있습니다. 가격이 손절선·익절선에 가까워지거나, 2분 이상
            간격을 두고 3번 이상 확인하면 됩니다. 짧은 간격으로 여러 번 눌러도 두 번째 조건에는 도움이
            되지 않습니다.
          </p>

          <Button type="button" size="sm" disabled={observing} onClick={() => void handleObserve()}>
            {observing ? '확인 중…' : '지금 가격 확인하기'}
          </Button>

          {latest && (
            <>
              <PriceGauge
                stopLoss={referenceStopLossPrice}
                current={latest.currentPrice}
                takeProfit={referenceTakeProfitPrice}
              />
              {verdict && <p className="text-sm text-ink">{verdict}</p>}
              <p className="text-xs text-muted tabular">지금까지 {observations.length}회 확인했습니다.</p>
            </>
          )}

          {observeError && <p className="text-sm text-loss">{observeError}</p>}
        </div>
      </Card>

      {canReflect && (
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
