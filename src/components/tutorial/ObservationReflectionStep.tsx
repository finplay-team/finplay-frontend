// 3단계 튜토리얼 — 가격 관찰(손절·익절 경계 근접 판정)을 시간이 흐르며 자동으로 진행하고, 조건 충족 후 자유 복기를 남겨 완료를 확정하는 위젯
import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { TickPriceChart } from './TickPriceChart'
import { recordHoldingObservation, saveHoldingReflection } from '../../services/tutorialService'
import { getPrice } from '../../services/instrumentService'
import type { PracticeBoundary, PracticeEvidenceType, PracticeHoldingObservationResponse } from '../../services/tutorialTypes'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { toUserMessage } from '../../lib/errorMessages'
import { formatDateTime, nowLocalDateTimeString, parseLocalDateTime } from '../../lib/datetime'

const REFLECTION_MAX = 2000
const DEFAULT_PROMPT = '지금 팔고 싶나요? 그렇다면 왜 그런가요? 계획한 손절·익절 라인과 비교해 적어보세요.'
const TICK_MS = 2000
const CHART_POINTS = 10
/** simulate 모드(다시 하기)에서만 쓰는 로컬 근사 판정 — 실제 서버 판정 공식과는 다르다. */
const SIMULATE_BOUNDARY_CLOSE_RATIO = 0.2
const SIMULATE_TIMED_REPETITION_MIN_COUNT = 3
const SIMULATE_TIMED_REPETITION_MIN_SPAN_MS = 2 * 60 * 1000

function simulateEvidence(
  price: number,
  priorCount: number,
  oldestObservedAt: string | null,
  stopLoss: number,
  takeProfit: number,
): { closerToBoundary: boolean | null; closerBoundary: PracticeBoundary | null; evidenceType: PracticeEvidenceType | null } {
  const range = Math.abs(takeProfit - stopLoss)
  if (range > 0) {
    const distanceToStop = Math.abs(price - stopLoss)
    const distanceToProfit = Math.abs(takeProfit - price)
    if (Math.min(distanceToStop, distanceToProfit) <= range * SIMULATE_BOUNDARY_CLOSE_RATIO) {
      return {
        closerToBoundary: true,
        closerBoundary: distanceToStop <= distanceToProfit ? 'STOP_LOSS' : 'TAKE_PROFIT',
        evidenceType: 'CLOSER_TO_BOUNDARY',
      }
    }
  }
  if (priorCount + 1 >= SIMULATE_TIMED_REPETITION_MIN_COUNT && oldestObservedAt) {
    const span = Date.now() - parseLocalDateTime(oldestObservedAt).getTime()
    if (span >= SIMULATE_TIMED_REPETITION_MIN_SPAN_MS) {
      return { closerToBoundary: false, closerBoundary: null, evidenceType: 'TIMED_REPETITION' }
    }
  }
  return { closerToBoundary: false, closerBoundary: null, evidenceType: null }
}

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
  simulate,
  onEvidenceReady,
  initialPrices = [],
  onPricesChanged,
}: {
  holdingId: number
  referenceStopLossPrice: number | null
  referenceTakeProfitPrice: number | null
  onCompleted: () => void
  /**
   * 2단계(매수 확인)에서 여기까지 이어 그린 시세 — 그래프가 0부터 다시 시작하지 않고 이어지도록
   * 앞머리에 붙여서 보여줄 뿐, 관찰·evidence 판정에는 전혀 쓰이지 않는다.
   */
  initialPrices?: number[]
  /**
   * 샘플 종목 4단계 흐름(031)에서는 이 3단계가 관찰만 담당하고 복기는 4단계(SaleReflectionStep)로
   * 옮겨진다 — evidence A/B가 준비돼도 여기서 복기 폼을 보여주거나 저장하지 않는다.
   */
  deferReflection?: boolean
  /**
   * "다시 하기"(TutorialReplay)에서 전달 — 백엔드가 완료 후 관찰·복기 API를 막으므로(409
   * PRACTICE_ALREADY_COMPLETED) instrumentId의 현재가를 직접 조회해 로컬로만 관찰·판정한다.
   */
  simulate?: { instrumentId: number }
  /**
   * evidence A/B(경계 접근·시간 분산)를 처음 충족한 순간 한 번 호출된다 — deferReflection이 true인
   * 4단계 흐름에서, 복기 폼을 갖고 있는 SaleReflectionStep(4단계)에게 "이제 복기를 저장해도 된다"를
   * 알려주는 용도(hasObservationEvidence). deferReflection이 false면 이 컴포넌트가 직접 복기를 받으므로
   * 굳이 쓰지 않아도 된다.
   */
  onEvidenceReady?: () => void
  /**
   * 이 단계에서 지금까지 이어 그린 시세(초기 이어받은 값 + 관찰 틱)가 바뀔 때마다 호출된다 — 4단계
   * (매도·복기) 그래프가 여기서 이어받아 0부터 다시 시작하지 않도록 부모가 들고 있는 용도일 뿐,
   * 판정에는 쓰이지 않는다.
   */
  onPricesChanged?: (prices: number[]) => void
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

  // simulate 모드에서 "2분 이상 간격" 판정에 쓸 가장 오래된 관찰을 tick() 클로저 밖에서도 최신으로
  // 읽기 위한 참조 — setInterval의 클로저는 effect가 재실행될 때까지 observations를 갇힌 값으로 본다.
  const observationsRef = useRef(observations)
  useEffect(() => {
    observationsRef.current = observations
  }, [observations])

  // 4단계(매도·복기) 그래프가 여기서 이어받을 수 있도록, 지금까지 이어 그린 시세가 바뀔 때마다
  // 부모에게 흘려보낸다 — early return(완료·evidence 미준비) 이전에 있어야 훅 순서가 항상 같다.
  useEffect(() => {
    if (!onPricesChanged) return
    onPricesChanged([
      ...initialPrices,
      ...observations
        .slice(0, CHART_POINTS)
        .map((o) => o.currentPrice)
        .reverse(),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations, initialPrices])

  const evidenceReadyFiredRef = useRef(false)
  useEffect(() => {
    if (canReflect && !evidenceReadyFiredRef.current) {
      evidenceReadyFiredRef.current = true
      onEvidenceReady?.()
    }
  }, [canReflect, onEvidenceReady])

  // 사람이 클릭할 때마다 진행하는 대신, 손절·익절 참고선이 준비되면 시간이 흐르는 대로 자동으로
  // 가격을 관찰한다 — 조건을 충족하거나(canReflect) 복기를 이미 마치면 멈춘다.
  useEffect(() => {
    if (referenceStopLossPrice === null || referenceTakeProfitPrice === null) return
    if (canReflect || completed) return
    const stopLoss = referenceStopLossPrice
    const takeProfit = referenceTakeProfitPrice

    let cancelled = false
    const tick = () => {
      if (observeBusyRef.current || cancelled) return
      observeBusyRef.current = true
      const request: Promise<PracticeHoldingObservationResponse> = simulate
        ? getPrice(simulate.instrumentId).then((res) => {
            if (res.price === null) throw new Error('가격을 불러오지 못했습니다.')
            const current = observationsRef.current
            const oldest = current.length > 0 ? current[current.length - 1].observedAt : null
            const ev = simulateEvidence(res.price, current.length, oldest, stopLoss, takeProfit)
            return {
              observationId: -1,
              holdingId,
              currentPrice: res.price,
              observedAt: nowLocalDateTimeString(),
              closerToBoundary: ev.closerToBoundary,
              closerBoundary: ev.closerBoundary,
              evidenceType: ev.evidenceType,
            }
          })
        : recordHoldingObservation(holdingId)
      request
        .then((res) => {
          if (cancelled) return
          setObservations((prev) => [res, ...prev])
          setObserveError(null)
          if (!simulate) bumpTutorial()
        })
        .catch((e) => {
          if (!cancelled) {
            setObserveError(
              simulate
                ? toUserMessage(e)
                : toUserMessage(e, {
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
  }, [holdingId, referenceStopLossPrice, referenceTakeProfitPrice, canReflect, completed, simulate])

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
    if (simulate) {
      setCompleted({ createdAt: nowLocalDateTimeString() })
      submitBusyRef.current = false
      setSubmitting(false)
      onCompleted()
      return
    }
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

  // 최신이 앞인 observations를 시간순으로 뒤집어 최근 10개만 그래프에 보여준다. 앞에는 2단계에서
  // 이어받은 시세를 붙여 그래프가 0부터 다시 시작하지 않게 한다.
  const chartPrices = [
    ...initialPrices,
    ...observations
      .slice(0, CHART_POINTS)
      .map((o) => o.currentPrice)
      .reverse(),
  ]

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
