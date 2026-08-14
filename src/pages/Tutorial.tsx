// 3단계 투자 실습 튜토리얼 — 즐겨찾기 → 의도 기록·매수 → 가격 관찰·복기를 한 페이지에서 진행한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { CandleChart } from '../components/CandleChart'
import { FavoriteStep } from '../components/tutorial/FavoriteStep'
import { IntentionStep } from '../components/tutorial/IntentionStep'
import { ObservationReflectionStep } from '../components/tutorial/ObservationReflectionStep'
import { SaleReflectionStep } from '../components/tutorial/SaleReflectionStep'
import { PracticeLogRail } from '../components/tutorial/PracticeLogRail'
import type { PracticeLogStep } from '../components/tutorial/PracticeLogRail'
import { PracticeScenarioCard } from '../components/tutorial/PracticeScenarioCard'
import { TutorialReplay } from '../components/tutorial/TutorialReplay'
import { Button } from '../components/ui/Button'
import { useTutorialProgress } from '../hooks/useTutorialProgress'
import { formatDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { ticksToCandles } from '../lib/tickCandles'
import { loadEvidenceSnapshot, saveEvidenceSnapshot } from '../lib/tutorialEvidenceSnapshot'
import { ensureInstrumentCache } from '../services/instrumentService'
import { getFavorites, getPracticeProgress, getSyntheticPrices } from '../services/tutorialService'
import type { FavoriteResponse, InvestmentPracticeResponse, PracticeIntentionResponse } from '../services/tutorialTypes'
import type { Market } from '../services/types'

/** 튜토리얼 미리보기용 합성 시세는 항상 3초 간격으로 온다(SyntheticPriceSeriesResponse.tickSeconds). */
const PREVIEW_TICK_MS = 3000

/**
 * 시장별 완료 상태를 보여주는 작은 pill. Trade.tsx 의 Pill 과 같은 톤이다(그 파일을 import 하지 않고
 * 여기서 다시 만든다). AWAITING_SALE·EXPIRED(샘플 종목 4단계, 031)는 진행중·완료 어느 쪽도 아니므로
 * 반드시 따로 다뤄야 한다 — 그러지 않으면 5분 매도 대기 중에 "불러오는 중"으로 잘못 보인다.
 */
function StatusPill({ label, status }: { label: string; status: InvestmentPracticeResponse['status'] | null }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-brand-soft text-brand'
      : status === 'IN_PROGRESS' || status === 'AWAITING_SALE'
        ? 'bg-white/[0.06] text-ink ring-1 ring-white/[0.1]'
        : status === 'EXPIRED'
          ? 'bg-loss/10 text-loss ring-1 ring-loss/20'
          : 'bg-white/[0.04] text-muted ring-1 ring-white/[0.08]'
  const text =
    status === 'COMPLETED'
      ? '완료'
      : status === 'IN_PROGRESS'
        ? '진행 중'
        : status === 'AWAITING_SALE'
          ? '매도 대기'
          : status === 'EXPIRED'
            ? '만료됨'
            : status === 'NOT_STARTED'
              ? '시작 전'
              : '불러오는 중'
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${tone}`}>
      {label} · {text}
    </span>
  )
}

function findStep(progress: InvestmentPracticeResponse | null, step: number) {
  return progress?.steps.find((s) => s.step === step) ?? null
}

export function Tutorial() {
  // 튜토리얼은 코인 샘플 종목(항시 시세, 장 시간 무관)이 진입 장벽이 가장 낮아 코인을 기본으로 연다.
  const [market, setMarket] = useState<Market>('CRYPTO')
  const isCrypto = market === 'CRYPTO'
  const { stock, crypto, error, refresh } = useTutorialProgress()
  const progress = isCrypto ? crypto : stock

  // 종목을 고르기 전부터 이미 움직이는 차트를 보여준다 — 이 시장의 샘플 종목 중 하나(연습 종목
  // 선택 목록에 쓰는 것과 같은 필터)의 합성 시세를 미리보기로만 쓴다. 실습 진행과는 무관하다.
  const [previewPrices, setPreviewPrices] = useState<number[]>([])
  useEffect(() => {
    let alive = true
    setPreviewPrices([])
    ensureInstrumentCache()
      .then((index) => {
        const sample = Array.from(index.byId.values())
          .filter((i) => i.market === market && i.isTutorialSample)
          .sort((a, b) => a.symbol.localeCompare(b.symbol))[0]
        if (!sample) return null
        return getSyntheticPrices(sample.instrumentId)
      })
      .then((series) => {
        if (alive && series) setPreviewPrices(series.prices)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [market])
  const previewCandles = useMemo(() => ticksToCandles(previewPrices, PREVIEW_TICK_MS), [previewPrices])

  // 이 시장의 즐겨찾기 목록 — FavoriteStep 이 내부적으로 자기 목록을 관리하지만,
  // 2단계(IntentionStep)에 넘길 "지금 진행 중인 chain 의 favorite" 은 여기서 별도로 찾아야 한다.
  const [favorites, setFavorites] = useState<FavoriteResponse[]>([])
  const [favoritesError, setFavoritesError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getFavorites()
      .then((list) => {
        if (alive) setFavorites(list)
      })
      .catch((e) => {
        if (alive) setFavoritesError(toUserMessage(e))
      })
    // progress 가 바뀔 때(관찰·복기·즐겨찾기 갱신 이후) 목록도 같이 새로고침한다.
  }, [progress])

  // 완료된 단계의 evidence(즐겨찾기·매수·복기 시각)는 이 스냅샷을 우선 보여준다 — 백엔드가 같은
  // 종목의 "가장 최근 체결"로 매번 다시 계산하기 때문에, "다시 하기" 체험 중 실제 매수·매도가
  // 원래 완료 시점을 흔들 수 있다(tutorialEvidenceSnapshot.ts 참고). 처음 완료 시 한 번 찍고,
  // "처음부터 다시하기"를 끝까지 마쳤을 때만 새로 찍는다.
  const [snapshotVersion, setSnapshotVersion] = useState(0)
  useEffect(() => {
    if (progress?.status === 'COMPLETED' && !loadEvidenceSnapshot(market)) {
      saveEvidenceSnapshot(market, progress)
      setSnapshotVersion((v) => v + 1)
    }
  }, [progress, market])

  const displayProgress = useMemo(() => {
    if (progress?.status !== 'COMPLETED') return progress
    return loadEvidenceSnapshot(market) ?? progress
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, market, snapshotVersion])

  const step1 = findStep(displayProgress, 1)
  const step2 = findStep(displayProgress, 2)
  const step3 = findStep(displayProgress, 3)
  // 샘플 종목 chain(031)만 4단계(매도·복기)를 갖는다 — steps 배열 길이로 구분한다.
  const step4 = findStep(displayProgress, 4)
  const isSandboxChain = (displayProgress?.steps.length ?? 0) === 4

  // 서버가 고른 chain 의 favoriteId. 아직 chain 이 없으면 이 시장에서 가장 먼저 등록한 favorite 로 대체한다
  // (favorite.createdAt ASC 가 서버 선택 규칙과 같다 — 016 진행조회 정본 참고).
  const activeFavorite = useMemo(() => {
    const marketFavorites = favorites
      .filter((f) => f.market === market)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.favoriteId - b.favoriteId)
    if (marketFavorites.length === 0) return null
    const evidenceFavoriteId = step1?.evidence.favoriteId
    return marketFavorites.find((f) => f.favoriteId === evidenceFavoriteId) ?? marketFavorites[0]
  }, [favorites, market, step1])

  // 2단계에 넘길 의도. 이번 방문(세션)에서 만든 것만 기억한다 — 새로고침하면 다시 폼부터 시작하지만
  // (GET 의도 조회 API 자체가 없어 서버에서 되찾을 방법이 없다), 여러 번 기록해도 해가 되지 않는다.
  const [intentionByMarket, setIntentionByMarket] = useState<Record<Market, PracticeIntentionResponse | null>>({
    STOCK: null,
    CRYPTO: null,
  })
  const intention = intentionByMarket[market]

  // 3단계를 이번 방문에서 이미 "살아있게" 보여주기 시작했으면, 서버 status 가 COMPLETED 로 바뀌어도
  // 방금 완료 카드를 계속 보여준다(플래시 후 사라지는 걸 막는다).
  const [step3LiveByMarket, setStep3LiveByMarket] = useState<Record<Market, boolean>>({
    STOCK: false,
    CRYPTO: false,
  })

  const handleIntentionCreated = useCallback(
    (created: PracticeIntentionResponse) => {
      setIntentionByMarket((prev) => ({ ...prev, [market]: created }))
    },
    [market],
  )

  // 4단계 5분 만료 후 "다시 시작"을 누르면 이 값을 올려 IntentionStep의 매수 화면을 다시 연다.
  const [buyResetNonceByMarket, setBuyResetNonceByMarket] = useState<Record<Market, number>>({
    STOCK: 0,
    CRYPTO: 0,
  })
  // 재도전 중(다시 매수하기 전)에는 서버가 여전히 만료된 이전 chain의 4단계를 돌려주므로,
  // 새 매수가 들어오기 전까지 화면에서만 4단계를 잠시 숨긴다.
  const [retryingByMarket, setRetryingByMarket] = useState<Record<Market, boolean>>({
    STOCK: false,
    CRYPTO: false,
  })

  // 2단계(매수 확인)에서 이어 그린 시세 — 3단계(관찰) 그래프가 0부터 다시 시작하지 않도록 앞머리로 넘겨준다.
  const [buyPriceHistoryByMarket, setBuyPriceHistoryByMarket] = useState<Record<Market, number[]>>({
    STOCK: [],
    CRYPTO: [],
  })
  // 3단계(관찰)에서 이어 그린 시세 — 4단계(매도·복기) 그래프가 이어받는다.
  const [observePriceHistoryByMarket, setObservePriceHistoryByMarket] = useState<Record<Market, number[]>>({
    STOCK: [],
    CRYPTO: [],
  })

  const handleBought = useCallback(
    (_execution?: unknown, priceHistory?: number[]) => {
      setRetryingByMarket((prev) => (prev[market] ? { ...prev, [market]: false } : prev))
      if (priceHistory) {
        setBuyPriceHistoryByMarket((prev) => ({ ...prev, [market]: priceHistory }))
      }
      setObservePriceHistoryByMarket((prev) => ({ ...prev, [market]: [] }))
      refresh()
    },
    [refresh, market],
  )

  const handleObservePricesChanged = useCallback(
    (prices: number[]) => {
      setObservePriceHistoryByMarket((prev) => ({ ...prev, [market]: prices }))
    },
    [market],
  )

  const handleRetry = useCallback(() => {
    setBuyResetNonceByMarket((prev) => ({ ...prev, [market]: prev[market] + 1 }))
    setRetryingByMarket((prev) => ({ ...prev, [market]: true }))
  }, [market])

  const handleStep3Completed = useCallback(() => {
    refresh()
  }, [refresh])

  const handleStep4Completed = useCallback(() => {
    refresh()
  }, [refresh])

  // 완료된 튜토리얼은 "다시 하기"로 재체험할 수 있다 — 완료 기록·보상은 그대로 둔다(TutorialReplay 참고).
  const [replayingByMarket, setReplayingByMarket] = useState<Record<Market, boolean>>({
    STOCK: false,
    CRYPTO: false,
  })
  const replaying = replayingByMarket[market]

  const handleStartReplay = useCallback(() => {
    // showLiveStep2·showLiveStep3 이 이번 방문에서 "살아있게" 켜진 채로 남아 있으면, 체험 종료 후
    // PracticeLogRail 이 다시 마운트한 IntentionStep·ObservationReflectionStep 이 완료 요약 대신
    // 처음 상태(활성 매수 버튼 등)로 보인다 — 시작 시 미리 꺼서 완료된 시장은 계속 요약만 보이게 한다.
    setIntentionByMarket((prev) => (prev[market] === null ? prev : { ...prev, [market]: null }))
    setStep3LiveByMarket((prev) => (prev[market] ? { ...prev, [market]: false } : prev))
    setReplayingByMarket((prev) => ({ ...prev, [market]: true }))
  }, [market])

  const handleReplayExit = useCallback(
    (completedFullRun: boolean) => {
      setReplayingByMarket((prev) => ({ ...prev, [market]: false }))
      if (!completedFullRun) return
      // 체험을 끝까지 마쳤을 때만 완료 시각 스냅샷을 이번 체험의 실제 매수·매도 시각으로 새로 찍는다.
      getPracticeProgress(market)
        .then((fresh) => {
          saveEvidenceSnapshot(market, fresh)
          setSnapshotVersion((v) => v + 1)
        })
        .catch(() => undefined)
      refresh()
    },
    [market, refresh],
  )

  useEffect(() => {
    if (step3 && step3.status !== 'COMPLETED' && !step3.locked) {
      setStep3LiveByMarket((prev) => (prev[market] ? prev : { ...prev, [market]: true }))
    }
  }, [step3, market])

  const showLiveStep2 = intention !== null || (step2 !== null && step2.status !== 'COMPLETED')
  const showLiveStep3 = step3LiveByMarket[market] || (step3 !== null && step3.status !== 'COMPLETED')

  // 지금 사용자가 실제로 해야 할 단계 번호. 즐겨찾기를 등록하거나 매수를 마치는 등으로 이 번호가
  // 올라가면, 사용자가 직접 스크롤해서 다음 단계를 찾지 않도록 그 자리로 자동 스크롤한다.
  const activeStepNumber = useMemo(() => {
    if (!step1 || step1.status !== 'COMPLETED') return 1
    if (!step2 || step2.status !== 'COMPLETED') return 2
    if (!step3 || step3.status !== 'COMPLETED') return 3
    return null
  }, [step1, step2, step3])

  const prevActiveStepRef = useRef<number | null>(null)
  const skipFirstScrollRef = useRef(true)
  useEffect(() => {
    if (skipFirstScrollRef.current) {
      // 페이지에 처음 들어왔을 때는 스크롤하지 않는다 — 이미 그 자리에 있다.
      skipFirstScrollRef.current = false
      prevActiveStepRef.current = activeStepNumber
      return
    }
    if (activeStepNumber !== null && activeStepNumber !== prevActiveStepRef.current) {
      document
        .getElementById(`practice-step-${activeStepNumber}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    prevActiveStepRef.current = activeStepNumber
  }, [activeStepNumber])

  const steps: PracticeLogStep[] = [
    {
      step: 1,
      title: '연습 종목 선택',
      status: step1?.status ?? 'NOT_STARTED',
      locked: step1?.locked ?? false,
      evidenceLabel: step1?.evidence.favoriteCreatedAt
        ? `${formatDateTime(step1.evidence.favoriteCreatedAt)} 종목 선택`
        : undefined,
      children: <FavoriteStep market={market} />,
    },
    {
      step: 2,
      title: '매수 전 의도 기록 · 매수',
      status: step2?.status ?? 'NOT_STARTED',
      locked: step2?.locked ?? true,
      evidenceLabel: step2?.evidence.buyTradeExecutedAt
        ? `${formatDateTime(step2.evidence.buyTradeExecutedAt)} 매수 체결`
        : step2?.evidence.intentionCreatedAt
          ? `${formatDateTime(step2.evidence.intentionCreatedAt)} 의도 기록`
          : undefined,
      children:
        !showLiveStep2 && step2?.status === 'COMPLETED' ? (
          <p className="text-sm text-muted">
            의도 기록과 매수를 마쳤습니다
            {step2.evidence.buyTradeExecutedAt ? ` · ${formatDateTime(step2.evidence.buyTradeExecutedAt)}` : ''}
          </p>
        ) : activeFavorite ? (
          <IntentionStep
            market={market}
            favorite={activeFavorite}
            intention={intention}
            onIntentionCreated={handleIntentionCreated}
            onBought={handleBought}
            resetToken={buyResetNonceByMarket[market]}
          />
        ) : (
          <p className="text-sm text-muted">1단계에서 연습할 종목을 먼저 골라주세요.</p>
        ),
    },
    {
      step: 3,
      title: isSandboxChain ? '가격 관찰 · 견디기' : '가격 관찰 · 복기',
      status: step3?.status ?? 'NOT_STARTED',
      locked: step3?.locked ?? true,
      evidenceLabel: step3?.evidence.reflectionCreatedAt
        ? `${formatDateTime(step3.evidence.reflectionCreatedAt)} 복기 저장`
        : step3?.evidence.observationObservedAt
          ? `${formatDateTime(step3.evidence.observationObservedAt)} 마지막 관찰`
          : undefined,
      children:
        !showLiveStep3 && step3?.status === 'COMPLETED' ? (
          <p className="text-sm text-muted">
            복기를 저장하고 실습을 완료했습니다
            {step3.evidence.reflectionCreatedAt ? ` · ${formatDateTime(step3.evidence.reflectionCreatedAt)}` : ''}
          </p>
        ) : step3?.evidence.holdingId ? (
          <ObservationReflectionStep
            holdingId={step3.evidence.holdingId}
            referenceStopLossPrice={step3.evidence.referenceStopLossPrice}
            referenceTakeProfitPrice={step3.evidence.referenceTakeProfitPrice}
            onCompleted={handleStep3Completed}
            deferReflection={isSandboxChain}
            initialPrices={buyPriceHistoryByMarket[market]}
            onPricesChanged={handleObservePricesChanged}
          />
        ) : (
          <p className="text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
        ),
    },
  ]

  // 샘플 종목 chain(031)만 4단계를 갖는다 — steps 배열 길이 자체가 3 또는 4로 달라진다.
  if (isSandboxChain) {
    steps.push({
      step: 4,
      title: '매도 · 복기',
      status: step4?.status ?? 'NOT_STARTED',
      locked: step4?.locked ?? true,
      evidenceLabel: step4?.evidence.reflectionCreatedAt
        ? `${formatDateTime(step4.evidence.reflectionCreatedAt)} 복기 저장`
        : step4?.evidence.sellTradeExecutedAt
          ? `${formatDateTime(step4.evidence.sellTradeExecutedAt)} 매도 체결`
          : undefined,
      children:
        retryingByMarket[market] ? (
          <p className="text-sm text-muted">2단계에서 새로 매수하면 여기서 다시 진행됩니다.</p>
        ) : step4?.status === 'COMPLETED' ? (
          <p className="text-sm text-muted">
            매도하고 복기를 저장해 실습을 완료했습니다
            {step4.evidence.reflectionCreatedAt ? ` · ${formatDateTime(step4.evidence.reflectionCreatedAt)}` : ''}
          </p>
        ) : step4?.evidence.holdingId ? (
          // activeFavorite 은 별도 비동기 getFavorites() 조회가 끝나야 채워진다 — 이 시점에 아직
          // null 이면 instrumentId 를 0 같은 값으로 대체해 매도 화면을 먼저 그리면 안 된다(그러면
          // getHoldings 결과에서 실제 보유종목을 못 찾아 "매도 가능한 수량이 없습니다" 오류가 난다).
          activeFavorite ? (
            <SaleReflectionStep
              market={market}
              instrumentId={activeFavorite.instrumentId}
              holdingId={step4.evidence.holdingId}
              expired={step4.status === 'EXPIRED'}
              saleDeadlineAt={step4.evidence.saleDeadlineAt}
              sellTradeId={step4.evidence.sellTradeId}
              referenceStopLossPrice={step4.evidence.referenceStopLossPrice}
              referenceTakeProfitPrice={step4.evidence.referenceTakeProfitPrice}
              hasObservationEvidence={step3?.evidence.evidenceType != null}
              onCompleted={handleStep4Completed}
              onRetry={handleRetry}
              initialPrices={observePriceHistoryByMarket[market]}
            />
          ) : (
            <p className="text-sm text-muted">불러오는 중…</p>
          )
        ) : (
          <p className="text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
        ),
    })
  }

  return (
    <div className="relative min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 right-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-3xl">
        <header>
          <Eyebrow>튜토리얼 · 3단계 투자 실습</Eyebrow>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
            처음이니까, 하나씩 해봅니다
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            처음 가입하면 여기부터입니다. 주식이나 코인 중 하나만 골라 아래 3단계(연습 종목 선택 → 매수 전
            의도 기록과 실제 매수 → 가격 관찰과 자유 복기)를 마치면 나머지 메뉴가 열립니다. 정답도 점수도
            없고, 완료는 직접 한 행동으로만 확인됩니다. 주식과 코인은 완전히 독립된 실습이라 한쪽을
            마쳐도 다른 쪽에 영향을 주지 않으며, 나중에 언제든 다시 와서 나머지 하나를 해볼 수 있습니다.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <MarketTabs market={market} onChange={setMarket} />
            <StatusPill label="주식" status={stock?.status ?? null} />
            <StatusPill label="코인" status={crypto?.status ?? null} />
          </div>

          {error && (
            <p className="mt-3 text-sm text-loss">진행 상태를 불러오지 못했습니다. 새로고침해 주세요.</p>
          )}
          {favoritesError && <p className="mt-3 text-sm text-loss">{favoritesError}</p>}
        </header>

        {/* 종목을 고르기 전부터 이미 흐르는 차트를 보여줘, 아래에서 뭘 고르게 될지 먼저 감을 잡게 한다. */}
        <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <Card accent={isCrypto ? 'coin' : 'brand'} innerClassName="p-4">
            <p className="text-xs text-muted">
              {market === 'CRYPTO' ? '코인' : '주식'} 가격은 이렇게 오르내려요 — 이제 아래에서 연습할
              종목을 골라볼게요.
            </p>
            <div className="mt-2">
              <CandleChart
                candles={previewCandles}
                height={160}
                maxBars={Math.max(previewCandles.length, 1)}
                interval="1m"
                emptyMessage="차트를 불러오는 중입니다."
              />
            </div>
          </Card>
          <PracticeScenarioCard market={market} />
        </div>

        {progress?.status === 'COMPLETED' && (
          <Card className="mt-8" accent={isCrypto ? 'coin' : 'brand'} innerClassName="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">
                {progress.rewardAmount != null
                  ? `이 실습을 완료해 보상 ${progress.rewardAmount.toLocaleString('ko-KR')}원을 받았습니다.`
                  : '이미 완료한 실습입니다.'}
              </p>
              {!replaying && activeFavorite && (
                <Button type="button" variant="ghost" size="sm" onClick={handleStartReplay}>
                  다시 하기
                </Button>
              )}
            </div>
          </Card>
        )}

        {replaying && activeFavorite ? (
          <div className="mt-8">
            <TutorialReplay market={market} favorite={activeFavorite} onExit={handleReplayExit} />
          </div>
        ) : (
          <Card className="mt-8" accent={isCrypto ? 'coin' : 'brand'} innerClassName="p-6 md:p-8">
            {/*
              최초 로딩(progress === null)에서만 스켈레톤을 보여준다. refresh() 로 인한 재조회 중에도
              이 조건으로 PracticeLogRail 을 계속 마운트해 두지 않으면, 그 안의 IntentionStep·
              ObservationReflectionStep 이 방금 만든 로컬 상태(체결·관찰 결과)를 통째로 잃는다 —
              progress 는 재조회 중에도 이전 값을 유지하므로 이 조건만으로 충분하다.
            */}
            {progress === null ? (
              <div className="space-y-6">
                <div className="skeleton h-16" />
                <div className="skeleton h-24" />
                <div className="skeleton h-24" />
              </div>
            ) : (
              <PracticeLogRail steps={steps} />
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
