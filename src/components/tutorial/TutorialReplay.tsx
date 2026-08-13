// 완료된 튜토리얼을 처음부터 다시 체험하는 위젯 — 실제 첫 튜토리얼과 똑같은 화면(PracticeLogRail +
// FavoriteStep·IntentionStep·ObservationReflectionStep·SaleReflectionStep)을 그대로 재사용한다.
// 완료 기록·보상은 그대로 두고(백엔드가 완료 후 의도·관찰·복기 API를 막으므로, 각 컴포넌트의
// simulate 모드로 그 세 단계만 로컬에서 처리한다) 즐겨찾기·매수·매도는 항상 실제로 처리된다.
import { useCallback, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { FavoriteStep } from './FavoriteStep'
import { IntentionStep } from './IntentionStep'
import { ObservationReflectionStep } from './ObservationReflectionStep'
import { SaleReflectionStep } from './SaleReflectionStep'
import { PracticeLogRail } from './PracticeLogRail'
import type { PracticeLogStep } from './PracticeLogRail'
import { toLocalDateTimeString } from '../../lib/datetime'
import type { FavoriteResponse, PracticeIntentionResponse } from '../../services/tutorialTypes'
import type { Market } from '../../services/types'

const SALE_DEADLINE_MINUTES = 5

export function TutorialReplay({
  market,
  favorite,
  onExit,
}: {
  market: Market
  favorite: FavoriteResponse
  /**
   * true면 1~4단계를 전부 끝까지 마치고 나간 것이다 — 부모가 이 경우에만 완료 시각 표시를 이번
   * 체험의 실제 매수·매도 시각으로 다시 찍는다. false(중간에 종료)면 이전 완료 표시를 그대로 둔다.
   */
  onExit: (completedFullRun: boolean) => void
}) {
  const isCrypto = market === 'CRYPTO'
  const accent = isCrypto ? 'coin' : 'brand'

  // 2단계에 넘길 의도 — 실제 Tutorial.tsx와 같은 패턴(부모가 들고 있어야 다시 매수 화면을 열 때도
  // 안 날아간다). 여기서는 순수 로컬 상태다(서버에 남기지 않는다, simulateIntention).
  const [intention, setIntention] = useState<PracticeIntentionResponse | null>(null)
  // 성공적으로 매수(체결)할 때마다 올라간다 — 3·4단계 컴포넌트를 완전히 새로 마운트하는 key로 쓰고,
  // holdingId 자리(로컬 시뮬레이션이라 실제 holding id가 필요 없다)로도 재사용한다.
  const [attemptId, setAttemptId] = useState(0)
  const [buyResetNonce, setBuyResetNonce] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [saleDeadlineAt, setSaleDeadlineAt] = useState<string | null>(null)
  const [evidenceReady, setEvidenceReady] = useState(false)
  const [done, setDone] = useState(false)
  // 2단계(매수 확인)에서 이어 그린 시세 — 3단계(관찰) 그래프가 0부터 다시 시작하지 않도록 넘겨준다.
  const [buyPriceHistory, setBuyPriceHistory] = useState<number[]>([])
  // 3단계(관찰)에서 이어 그린 시세 — 4단계(매도·복기) 그래프가 이어받는다.
  const [observePriceHistory, setObservePriceHistory] = useState<number[]>([])

  const handleIntentionCreated = useCallback((created: PracticeIntentionResponse) => {
    setIntention(created)
  }, [])

  const handleBought = useCallback((_execution?: unknown, priceHistory?: number[]) => {
    setRetrying(false)
    setEvidenceReady(false)
    setSaleDeadlineAt(toLocalDateTimeString(new Date(Date.now() + SALE_DEADLINE_MINUTES * 60_000)))
    setBuyPriceHistory(priceHistory ?? [])
    setObservePriceHistory([])
    setAttemptId((n) => n + 1)
  }, [])

  // 5분 매도 시한이 지나도 매도하지 않았을 때만 쓰는 좁은 재시작 — 매수 화면으로만 돌아간다(의도는
  // 그대로 유지). "처음부터 다시하기"(handleRestart)와는 별개의 동작이다.
  const handleRetry = useCallback(() => {
    setBuyResetNonce((n) => n + 1)
    setRetrying(true)
    setSaleDeadlineAt(null)
    setEvidenceReady(false)
  }, [])

  // 어느 단계에 있든 이 체험 전체를 1단계(즐겨찾기)부터 다시 시작한다 — 5분 만료 재시작과 달리
  // 의도·수량·손절익절가·매수 이후 진행을 전부 초기화한다.
  const handleRestart = useCallback(() => {
    setIntention(null)
    setAttemptId(0)
    setBuyResetNonce((n) => n + 1)
    setRetrying(false)
    setSaleDeadlineAt(null)
    setEvidenceReady(false)
    setDone(false)
    setBuyPriceHistory([])
    setObservePriceHistory([])
  }, [])

  const handleStep4Completed = useCallback(() => {
    setDone(true)
  }, [])

  // deferReflection 모드라 3단계 자체는 복기를 받지 않는다 — onCompleted는 절대 호출되지 않지만
  // prop은 필수라 no-op을 넘긴다. onEvidenceReady와 함께 인라인 화살표 대신 useCallback으로 고정해,
  // simulateConfig처럼 다른 prop이 렌더마다 바뀌는 값이 되어 자식 effect를 흔드는 걸 방지한다.
  const handleStep3NoopCompleted = useCallback(() => undefined, [])
  const handleEvidenceReady = useCallback(() => setEvidenceReady(true), [])

  // ObservationReflectionStep의 관찰 useEffect가 simulate를 deps로 쓴다 — 매 렌더마다 새 객체를
  // 넘기면 참조가 계속 바뀌어 effect가 매번 정리·재시작되면서 tick()이 2초 간격을 지키지 못하고
  // 렌더될 때마다 즉시 다시 도는 폭주가 생긴다(실제로 겪음). instrumentId가 같으면 같은 참조를 쓴다.
  const simulateConfig = useMemo(() => ({ instrumentId: favorite.instrumentId }), [favorite.instrumentId])

  const bought = attemptId > 0

  const steps: PracticeLogStep[] = [
    {
      step: 1,
      title: '즐겨찾기',
      status: 'COMPLETED',
      locked: false,
      children: <FavoriteStep market={market} />,
    },
    {
      step: 2,
      title: '매수 전 의도 기록 · 매수',
      status: intention === null ? 'NOT_STARTED' : bought ? 'COMPLETED' : 'IN_PROGRESS',
      locked: false,
      children: (
        <IntentionStep
          market={market}
          favorite={favorite}
          intention={intention}
          onIntentionCreated={handleIntentionCreated}
          onBought={handleBought}
          resetToken={buyResetNonce}
          simulateIntention
        />
      ),
    },
    {
      step: 3,
      title: '가격 관찰 · 견디기',
      status: !bought ? 'NOT_STARTED' : evidenceReady ? 'COMPLETED' : 'IN_PROGRESS',
      locked: !bought,
      children: intention ? (
        <ObservationReflectionStep
          key={attemptId}
          holdingId={attemptId}
          referenceStopLossPrice={intention.stopLoss}
          referenceTakeProfitPrice={intention.takeProfit}
          onCompleted={handleStep3NoopCompleted}
          deferReflection
          simulate={simulateConfig}
          onEvidenceReady={handleEvidenceReady}
          initialPrices={buyPriceHistory}
          onPricesChanged={setObservePriceHistory}
        />
      ) : null,
    },
    {
      step: 4,
      title: '매도 · 복기',
      status: done ? 'COMPLETED' : bought ? 'IN_PROGRESS' : 'NOT_STARTED',
      locked: !bought,
      children: retrying ? (
        <p className="text-sm text-muted">2단계에서 새로 매수하면 여기서 다시 진행됩니다.</p>
      ) : intention ? (
        <SaleReflectionStep
          key={attemptId}
          market={market}
          instrumentId={favorite.instrumentId}
          holdingId={attemptId}
          expired={false}
          saleDeadlineAt={saleDeadlineAt}
          sellTradeId={null}
          referenceStopLossPrice={intention.stopLoss}
          referenceTakeProfitPrice={intention.takeProfit}
          hasObservationEvidence={evidenceReady}
          onCompleted={handleStep4Completed}
          onRetry={handleRetry}
          simulate
          initialPrices={observePriceHistory}
        />
      ) : null,
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>다시 체험하기 · {favorite.name}</Eyebrow>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleRestart}>
            처음부터 다시하기
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onExit(false)}>
            종료
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        완료 기록과 보상은 그대로 유지됩니다 — 이 체험은 진행 상태에 영향을 주지 않습니다. 즐겨찾기·매수·매도는
        실제로 처리되지만, 의도·관찰·복기는 다시 저장되지 않습니다.
      </p>

      <Card className="mt-6" accent={accent} innerClassName="p-6 md:p-8">
        <PracticeLogRail steps={steps} />
      </Card>

      {done && (
        <Card className="mt-6" accent={accent} innerClassName="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink">1~4단계를 모두 다시 체험했습니다.</p>
            <Button type="button" onClick={() => onExit(true)}>
              체험 종료
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
