// 영속 attempt 튜토리얼의 단일 차트 폴링·재시작·주문·replay 상태를 DOM에서 검증한다.
import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEntryResponse,
  PracticeEvidenceResponse,
  PracticeExitPlanSummary,
  PracticeOrderResponse,
  PracticeOverallStatus,
  PracticeTutorialChartResponse,
  TutorialStageProgress,
} from '../../services/tutorialTypes'
import {
  advancePracticeAttemptScript,
  createPracticeExitPlan,
  getPracticeAttemptChart,
  getPracticeAttemptOrders,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import { cancelExitPlan } from '../../services/exitPlanService'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import { amendLimitOrder, cancelLimitOrder, placeLimitOrder, placeOrder } from '../../services/orderService'
import { AttemptTutorialFlow } from './AttemptTutorialFlow'

vi.mock('../CandleChart', () => ({
  // 참고선(손절·익절)은 이 화면이 계산해 넘기는 값이라 테스트 대역도 그 라벨·가격을 드러내야 한다 —
  // 봉 개수만 그리면 "선을 그렸는가"를 검증할 수 없다.
  CandleChart: ({
    candles,
    referenceLines,
  }: {
    candles: unknown[]
    referenceLines?: { value: number; label: string }[]
  }) => (
    <div data-testid="practice-chart">
      {candles.length}
      {(referenceLines ?? []).map((line) => (
        <span key={line.label} data-testid="chart-reference-line">{`${line.label} ${Math.round(line.value)}`}</span>
      ))}
    </div>
  ),
}))
// 초보자 안내 카드와 스포트라이트 투어는 각각 자체 테스트가 있다 — 여기서는 흐름만 본다.
// 다만 어떤 단계 배열을 넘겼는지는 이 화면의 책임이라, 오버레이는 그리지 않고 target만 받아 둔다.
vi.mock('./CandleGuide', () => ({ CandleGuide: () => <div data-testid="candle-guide" /> }))
const tourSpy = vi.hoisted(() => ({ targets: [] as string[], mounts: 0 }))
vi.mock('./SpotlightTour', () => ({
  SpotlightTour: ({ steps }: { steps: { target: string }[] }) => {
    tourSpy.targets = steps.map((step) => step.target)
    // "안내 다시 보기"는 key 를 바꿔 리마운트시키는 방식이라, 마운트 횟수가 곧 검증 대상이다.
    useEffect(() => {
      tourSpy.mounts += 1
    }, [])
    return null
  },
}))
vi.mock('../../hooks/useIdempotencyKey', () => ({ useIdempotencyKey: () => 'tutorial-key' }))
vi.mock('../../lib/tutorialPulse', () => ({ bumpTutorial: vi.fn() }))
vi.mock('../../services/instrumentService', () => ({
  loadInstruments: vi.fn(),
  ensureInstrumentCache: vi.fn(),
  getCachedInstrument: vi.fn(),
}))
vi.mock('../../services/orderService', () => ({
  amendLimitOrder: vi.fn(),
  cancelLimitOrder: vi.fn(),
  placeLimitOrder: vi.fn(),
  placeOrder: vi.fn(),
}))
vi.mock('../../services/tutorialService', () => ({
  advancePracticeAttemptScript: vi.fn(),
  createPracticeExitPlan: vi.fn(),
  getPracticeAttemptChart: vi.fn(),
  getPracticeAttemptOrders: vi.fn(),
  recordHoldingObservation: vi.fn(),
  restartPracticeAttempt: vi.fn(),
  saveHoldingReflection: vi.fn(),
  // 화면은 더 이상 부르지 않지만(2026-08-21 재설계) 서버·서비스에는 남아 있는 경로다.
  updateExitRates: vi.fn(),
  selectPracticeInstrument: vi.fn(),
  tickPracticeAttempt: vi.fn(),
}))
// 예약 취소는 실전과 같은 경로를 쓴다 — 튜토리얼 전용 취소 API가 따로 없다.
vi.mock('../../services/exitPlanService', () => ({ cancelExitPlan: vi.fn() }))

const chart: PracticeTutorialChartResponse = {
  attemptId: 10,
  runNumber: 1,
  instrumentId: 701,
  virtualDateTime: '2026-08-14T12:00:00',
  secondsPerVirtualMinute: 3,
  scenarioStage: null,
  scenarioProgressing: null,
  causeStatus: null,
  revealedEvents: [],
  priceGuideRange: null,
  candles: [
    { date: '2026-08-14', open: 100, high: 130, low: 90, close: 123, current: true },
  ],
}

function evidence(overrides: Partial<PracticeEvidenceResponse> = {}): PracticeEvidenceResponse {
  return {
    favoriteId: null,
    favoriteCreatedAt: null,
    intentionId: null,
    intentionCreatedAt: null,
    buyTradeId: null,
    buyTradeExecutedAt: null,
    holdingId: null,
    referenceStopLossPrice: null,
    referenceTakeProfitPrice: null,
    observationId: null,
    observationObservedAt: null,
    evidenceType: null,
    reflectionId: null,
    reflectionCreatedAt: null,
    sellTradeId: null,
    sellTradeExecutedAt: null,
    saleDeadlineAt: null,
    buyQuantity: null,
    sellQuantity: null,
    remainingQuantity: null,
    ...overrides,
  }
}

const risk = {
  entryPrice: 10000,
  stopLossPrice: 9700,
  takeProfitPrice: 10500,
  buyTradeId: 31,
  createdAt: '2026-08-14T12:00:00',
  // 042 이전 기본값(BALANCED, -3%·+5%)과 같다 — 서버가 기능 도입 전 스냅샷을 이렇게 해석해 내려보낸다.
  exitPreset: 'BALANCED' as const,
  stopLossRate: 3,
  takeProfitRate: 5,
  entrySequence: 1,
}

/** 사용자가 직접 건 예약(2026-08-21 재설계). 기준가 10,000원 · 손절 -3% · 익절 +5%. */
const exitPlan: PracticeExitPlanSummary = {
  exitPlanId: 77,
  stopLossRate: 3,
  takeProfitRate: 5,
  stopLossPrice: 9700,
  takeProfitPrice: 10500,
}

/** 지금 2개를 보유 중인 상태의 evidence — 예약을 걸 수 있는 유일한 상태다. */
function holdingEvidence(overrides: Partial<PracticeEvidenceResponse> = {}): PracticeEvidenceResponse {
  return evidence({
    buyTradeId: 31,
    holdingId: 41,
    observationId: 51,
    buyQuantity: 2,
    remainingQuantity: 2,
    ...overrides,
  })
}

/** 한 진입의 기록. 손절/익절을 "겪었는가"의 폴백 판정이 이 배열의 `sellCause`를 읽는다. */
function entry(overrides: Partial<PracticeEntryResponse> = {}): PracticeEntryResponse {
  return {
    entrySequence: 1,
    exitPreset: null,
    stopLossRate: 3,
    takeProfitRate: 5,
    buyAt: '2026-08-14T12:00:00',
    buyPrice: 10000,
    buyQuantity: 2,
    buyOrderType: 'MARKET',
    stopLossPrice: 9700,
    takeProfitPrice: 10500,
    sellPrice: 9700,
    sellQuantity: 2,
    sellAt: '2026-08-14T12:05:00',
    sellCause: 'STOP_LOSS',
    realizedPnl: -600,
    unrealizedPnlIfHeld: null,
    scenarioScriptId: 'CRYPTO_STORY_V1',
    ...overrides,
  }
}

function attempt(overrides: Partial<PracticeAttemptResponse> = {}): PracticeAttemptResponse {
  return {
    attemptId: 10,
    market: 'CRYPTO',
    runNumber: 1,
    mode: 'ACTIVE',
    status: 'IN_PROGRESS',
    instrumentId: 701,
    anchorAt: '2026-08-14T12:00:00',
    tutorialDate: '2026-08-14',
    riskSnapshot: null,
    completedAt: null,
    tutorialCashBalance: 0,
    tutorialAvailableCash: 0,
    tutorialRealizedPnl: 0,
    exitStopLossRate: 3,
    exitTakeProfitRate: 5,
    exitPresetLocked: false,
    ...overrides,
  }
}

function progress(
  currentEvidence = evidence(),
  status: InvestmentPracticeResponse['status'] = 'IN_PROGRESS',
  stepFourStatus: PracticeOverallStatus = 'IN_PROGRESS',
  // 백엔드 #429부터 4단계 잠금은 관찰 여부와 무관하게 서버가 결정한다 — 기본값 false는
  // "매수 직후 곧바로 매도가 열린 상태"를 뜻한다.
  stepFourLocked = false,
  stageProgress: TutorialStageProgress = {
    marketBuySellCompleted: false,
    limitBuySellCompleted: false,
    exitPresetSelected: false,
  },
): InvestmentPracticeResponse {
  return {
    tutorialKey: 'COIN_PRACTICE_V1',
    status,
    currentStep: status === 'COMPLETED' ? null : 2,
    completedAt: status === 'COMPLETED' ? '2026-08-14T12:10:00' : null,
    rewardAmount: status === 'COMPLETED' ? 5_000_000 : null,
    entries: [],
    priceAfterSell: null,
    revealedEvents: [],
    attempt: null,
    tutorialStageProgress: stageProgress,
    steps: [
      { step: 1, status: 'COMPLETED', locked: false, evidence: currentEvidence },
      { step: 2, status: 'COMPLETED', locked: false, evidence: currentEvidence },
      { step: 3, status: 'IN_PROGRESS', locked: false, evidence: currentEvidence },
      { step: 4, status: stepFourStatus, locked: stepFourLocked, evidence: currentEvidence },
    ],
  }
}

function renderFlow(
  currentAttempt = attempt(),
  currentProgress = progress(),
  onRefresh = vi.fn().mockResolvedValue(undefined),
  onAttemptChange = vi.fn(),
) {
  // 완료 화면의 "실전 거래 시작하기"가 react-router Link 라 라우터 컨텍스트가 필요하다.
  return render(
    <MemoryRouter>
      <AttemptTutorialFlow
        market={currentAttempt.market}
        attempt={currentAttempt}
        progress={currentProgress}
        onAttemptChange={onAttemptChange}
        onRefresh={onRefresh}
      />
    </MemoryRouter>,
  )
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function practiceOrder(overrides: Partial<PracticeOrderResponse> = {}): PracticeOrderResponse {
  return {
    orderId: 88,
    market: 'CRYPTO',
    instrumentId: 701,
    side: 'BUY',
    orderType: 'LIMIT',
    status: 'PENDING',
    quantity: 1,
    limitPrice: 123,
    requestedAt: '2026-08-14T12:00:00',
    practiceAttemptId: 10,
    practiceAttemptRunNumber: 1,
    ...overrides,
  }
}

describe('AttemptTutorialFlow', () => {
  beforeEach(() => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue(chart)
    vi.mocked(tickPracticeAttempt).mockResolvedValue(chart)
    vi.mocked(ensureInstrumentCache).mockResolvedValue({ byId: new Map(), bySymbol: new Map() })
    vi.mocked(getCachedInstrument).mockReturnValue(undefined)
    vi.mocked(loadInstruments).mockResolvedValue([
      {
        instrumentId: 701,
        market: 'CRYPTO',
        symbol: 'SANDBOX_COIN_1',
        name: '연습 코인',
        tickSize: 1,
        minOrderAmount: 5000,
        tradable: true,
        isTutorialSample: true,
      },
    ])
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([])
    vi.mocked(amendLimitOrder).mockResolvedValue({} as never)
    vi.mocked(placeOrder).mockResolvedValue({} as never)
    vi.mocked(placeLimitOrder).mockResolvedValue({} as never)
    vi.mocked(cancelLimitOrder).mockResolvedValue(undefined)
    vi.mocked(recordHoldingObservation).mockResolvedValue({} as never)
    vi.mocked(saveHoldingReflection).mockResolvedValue({} as never)
    vi.mocked(selectPracticeInstrument).mockResolvedValue(attempt())
    vi.mocked(restartPracticeAttempt).mockResolvedValue(
      attempt({ runNumber: 2, status: 'SELECTING_INSTRUMENT', instrumentId: null }),
    )
    vi.mocked(advancePracticeAttemptScript).mockResolvedValue(attempt())
    vi.mocked(createPracticeExitPlan).mockResolvedValue(undefined)
    vi.mocked(cancelExitPlan).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads one chart with pure GET, ticks every 3 seconds without overlap, and cleans up', async () => {
    vi.useFakeTimers()
    let resolveFirstTick!: (value: PracticeTutorialChartResponse) => void
    vi.mocked(tickPracticeAttempt)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirstTick = resolve }))
      .mockResolvedValue(chart)
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const view = renderFlow(attempt(), progress(), onRefresh)
    await flushPromises()

    expect(getPracticeAttemptChart).toHaveBeenCalledTimes(1)
    expect(tickPracticeAttempt).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('practice-chart')).toHaveLength(1)

    await act(async () => vi.advanceTimersByTime(3000))
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(9000))
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(1)

    resolveFirstTick(chart)
    await flushPromises()
    await act(async () => vi.advanceTimersByTime(2999))
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(1))
    await flushPromises()
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(2)

    view.unmount()
    await act(async () => vi.advanceTimersByTime(9000))
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(2)
  })

  it('pauses tick while the tab is hidden and resumes immediately when visible', async () => {
    vi.useFakeTimers()
    let hidden = true
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    renderFlow()
    await flushPromises()

    await act(async () => vi.advanceTimersByTime(9000))
    expect(tickPracticeAttempt).not.toHaveBeenCalled()

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => vi.advanceTimersByTime(0))
    await flushPromises()
    expect(tickPracticeAttempt).toHaveBeenCalledTimes(1)
  })

  it('offers market and limit orders and defaults limit price to the shared latest close', async () => {
    vi.mocked(placeLimitOrder).mockResolvedValue({
      orderId: 88,
      market: 'CRYPTO',
      instrumentId: 701,
      side: 'BUY',
      orderType: 'LIMIT',
      status: 'PENDING',
      quantity: 1,
      limitPrice: 123,
      requestedAt: '2026-08-14T12:00:00',
    })
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())

    // 개발 용어를 걷어내되 구어체는 피한다 — 시장가 매수 버튼은 "지금 값에 구매하기"다.
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가' }))
    fireEvent.click(screen.getByRole('button', { name: '현재가' }))
    expect(screen.getByLabelText('지정가')).toHaveValue('123')
    fireEvent.click(screen.getByRole('button', { name: '정한 값에 주문 넣기' }))

    await waitFor(() => expect(placeLimitOrder).toHaveBeenCalledWith(
      {
        market: 'CRYPTO',
        instrumentId: 701,
        side: 'BUY',
        quantity: '1',
        limitPrice: '123',
      },
      'tutorial-key',
    ))
    expect(await screen.findByText(/정한 값이 되기를 기다리는 중입니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(88))
  })

  it('hydrates a pending limit order from the tutorial order endpoint and can cancel it', async () => {
    // 435: 이 엔드포인트는 인증 사용자의 현재 attempt·run 귀속 주문만 오므로, 예전처럼
    // attemptId·runNumber로 다시 걸러낼 필요가 없다 — 서버가 이미 그 범위로 좁혀서 준다.
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])

    renderFlow()
    await waitFor(() => expect(getPracticeAttemptOrders).toHaveBeenCalledWith('CRYPTO'))

    expect(await screen.findByText(/정한 값이 되기를 기다리는 중입니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))
  })

  it('다른 종목이거나 이미 끝난 주문은 예약 카드로 복원하지 않는다', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([
      practiceOrder({ orderId: 91, status: 'FILLED' }),
      practiceOrder({ orderId: 92, instrumentId: 999 }),
    ])

    renderFlow()
    await waitFor(() => expect(getPracticeAttemptOrders).toHaveBeenCalledWith('CRYPTO'))

    expect(screen.queryByText(/정한 값이 되기를 기다리는 중입니다/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지정가 주문 취소' })).not.toBeInTheDocument()
    expect(cancelLimitOrder).not.toHaveBeenCalled()
  })

  it('지정가 대기 중에는 기다리지 않고 지금 값에 체결하는 탈출로를 제공한다', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '기다리지 않고 지금 값에 구매하기' }))

    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))
    await waitFor(() => expect(placeOrder).toHaveBeenCalledWith(
      { market: 'CRYPTO', instrumentId: 701, side: 'BUY', orderType: 'MARKET', quantity: '1' },
      'tutorial-key',
    ))
  })

  it('keeps STOCK market-only because the backend rejects stock limit orders', async () => {
    renderFlow(
      attempt({ market: 'STOCK', instrumentId: 801, riskSnapshot: null }),
      { ...progress(), tutorialKey: 'INVESTMENT_PRACTICE_V1' },
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalledWith('STOCK'))

    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지정가' })).not.toBeInTheDocument()
    // 주식은 1주 단위라는 걸 오류로 처음 알게 되면 안 된다 — 라벨에 미리 병기한다.
    expect(screen.getByText(/몇 개 구매할까요 \(1주 단위\)/)).toBeInTheDocument()
  })

  it('uses server risk values and reload-safe remaining quantity for SELL', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      sellTradeId: 61,
      buyQuantity: 2,
      sellQuantity: 0.75,
      remainingQuantity: 1.25,
    })
    // 기준선 카드는 **예약이 걸려 있을 때만** 뜬다(2026-08-21 재설계) — 예약 없이 그 선을 보여주면
    // 아무도 지키지 않을 약속을 그리는 셈이다.
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(currentEvidence),
      pendingExitPlan: exitPlan,
    })

    // 손절·익절선 가격은 차트 점선과 차트 요약 한 줄만 말한다 — 예전에는 같은 값이 다섯 곳에 있었다.
    expect(screen.getByText('손절 -3% 9700')).toBeInTheDocument()
    expect(screen.getByText('익절 +5% 10500')).toBeInTheDocument()
    // 복기 입력은 전량 매도 뒤에만 열린다. placeholder에 숨겼던 질문을 고정 라벨로 올렸다.
    expect(screen.queryByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.')).not.toBeInTheDocument()
    // 예약이 걸려 있는 동안 매도 버튼은 위계를 낮추고 라벨도 바뀐다 — 참는 걸 가르치는 화면에서
    // 가장 크고 빨간 버튼이 "전부 판매하기"면 안 된다. 길을 막지는 않는다.
    fireEvent.click(screen.getByRole('button', { name: '기다리지 않고 지금 팔기' }))

    await waitFor(() => expect(placeOrder).toHaveBeenCalledWith(
      {
        market: 'CRYPTO',
        instrumentId: 701,
        side: 'SELL',
        orderType: 'MARKET',
        quantity: '1.25',
      },
      'tutorial-key',
    ))
  })

  it('서버가 steps[3].locked=true를 내려주면 관찰 여부와 무관하게 매도 버튼을 잠그고 이유를 인라인으로 알린다', async () => {
    // 4단계 잠금은 더 이상 프론트가 관찰 여부로 계산하지 않는다 — 서버(백엔드 #429)가 내려주는
    // steps[3].locked를 그대로 따른다. observationId가 있어도(관찰을 이미 했어도) locked=true면 잠긴다.
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: 2,
      remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence, 'IN_PROGRESS', 'IN_PROGRESS', true))
    await flushPromises()

    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeDisabled()
    expect(screen.getByText('가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.')).toBeInTheDocument()
  })

  it('서버가 매도를 열어 두면(steps[3].locked=false) 관찰 기록이 없어도 매도 버튼이 눌리지만, 누르면 확인창을 먼저 띄운다', async () => {
    // 백엔드 #429부터 서버는 관찰과 무관하게 매수 직후 5분 창 안에서 곧바로 매도를 열어 둔다.
    // 대신 한 번도 지켜보지 않은 채 파는 것은 확인이 필요하다.
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    const sellButton = screen.getByRole('button', { name: '가진 2개 전부 판매하기' })
    expect(sellButton).toBeEnabled()
    expect(screen.queryByText('가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.')).not.toBeInTheDocument()

    fireEvent.click(sellButton)
    expect(placeOrder).not.toHaveBeenCalled()
    expect(screen.getByText('아직 한 번도 지켜보지 않았는데, 그래도 팔까요?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await flushPromises()
    expect(placeOrder).not.toHaveBeenCalled()
    expect(screen.queryByText('아직 한 번도 지켜보지 않았는데, 그래도 팔까요?')).not.toBeInTheDocument()
  })

  it('무관찰 확인창에서 확인을 누르면 그제서야 매도가 진행된다', async () => {
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '가진 2개 전부 판매하기' }))
    fireEvent.click(screen.getByRole('button', { name: '그래도 판매' }))

    await waitFor(() => expect(placeOrder).toHaveBeenCalledWith(
      {
        market: 'CRYPTO',
        instrumentId: 701,
        side: 'SELL',
        orderType: 'MARKET',
        quantity: '2',
      },
      'tutorial-key',
    ))
    expect(screen.queryByText('아직 한 번도 지켜보지 않았는데, 그래도 팔까요?')).not.toBeInTheDocument()
  })

  it('관찰 기록이 이미 있으면 확인창 없이 바로 매도를 진행한다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: 2,
      remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '가진 2개 전부 판매하기' }))

    expect(screen.queryByText('아직 한 번도 지켜보지 않았는데, 그래도 팔까요?')).not.toBeInTheDocument()
    await waitFor(() => expect(placeOrder).toHaveBeenCalled())
  })

  it('매수 화면에는 손절·익절이 아예 없다 — 실전 매수 폼과 같아진다 (2026-08-21 재설계)', async () => {
    // 제품 오너 지적: "매수는 지정가·시장가로 하고 매도할 때 예약매도로 손절·익절을 겪는 것"인데
    // 매수 폼에 비율 입력이 떠 있어 실전 순서와 어긋났다. 입력도, 매수 전 손익 어림 줄도 여기서 뺐다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 12000, high: 12500, low: 11800, close: 12340, current: true }],
    })
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.change(screen.getByLabelText('주문 금액'), { target: { value: '123400' } })

    expect(screen.queryByLabelText('손절 비율 (−%)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('익절 비율 (+%)')).not.toBeInTheDocument()
    expect(screen.queryByText(/지금 값이면 손절선은/)).not.toBeInTheDocument()
    expect(screen.queryByText(/사는 순간의 값을 기준으로 팔 기준선 두 개/)).not.toBeInTheDocument()
    // 매수에 필요한 것들은 그대로 있어야 한다.
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
  })

  it('매수 전에는 차트에 손절·익절선을 그리지 않는다 — 아직 아무 예약도 없기 때문이다', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 12000, high: 12500, low: 11800, close: 12340, current: true }],
    })
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.queryAllByTestId('chart-reference-line')).toHaveLength(0)
  })

  it('코인 시장가 매수는 attempt의 실제 잔액을 "주문 가능"으로 보여준다 (이슈 #502)', async () => {
    renderFlow(attempt({ riskSnapshot: null, tutorialAvailableCash: 350_000 }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByText('주문 가능')).toBeInTheDocument()
    expect(screen.getByText('350,000원')).toBeInTheDocument()
  })

  it('금액을 입력하면 실전 화면(pages/Trade.tsx)과 같은 실제 매수 금액·수수료를 숫자로 보여준다', async () => {
    // 100,000원 × 1.0005(수수료) = 100,050원이 1단위 비용이다 — 1,000,500원을 넣으면 수수료까지
    // 딱 나눠떨어져 수량이 정수(10개)가 되고, 실제 매수 금액도 딱 떨어진 숫자(1,000,000원)가 된다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 100000, high: 100000, low: 100000, close: 100000, current: true }],
    })
    renderFlow(attempt({ riskSnapshot: null, tutorialAvailableCash: 2_000_000 }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.change(screen.getByLabelText('주문 금액'), { target: { value: '1000500' } })

    expect(screen.getByText('실제 매수 금액 (수수료 제외)')).toBeInTheDocument()
    expect(screen.getByText('1,000,000원')).toBeInTheDocument()
    expect(screen.getByText('수수료 (0.05%)')).toBeInTheDocument()
    expect(screen.getByText('500원')).toBeInTheDocument()
    expect(
      screen.getByText(/입력한 1,000,500원 중 수수료를 뺀 1,000,000원만큼만 실제/),
    ).toBeInTheDocument()
  })

  it('금액을 비우면 실제 매수 금액·수수료 박스를 렌더하지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null, tutorialAvailableCash: 2_000_000 }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.queryByText('실제 매수 금액 (수수료 제외)')).not.toBeInTheDocument()
  })

  it('퍼센트 버튼을 누르면 가진 돈의 그 비율만큼 주문 금액을 채운다', async () => {
    renderFlow(attempt({ riskSnapshot: null, tutorialAvailableCash: 200_000 }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '25%' }))
    expect(screen.getByLabelText('주문 금액')).toHaveValue('50000')

    fireEvent.click(screen.getByRole('button', { name: '최대' }))
    expect(screen.getByLabelText('주문 금액')).toHaveValue('200000')
  })

  it('가진 돈이 없으면 퍼센트 버튼을 눌러도 반응하지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null, tutorialAvailableCash: 0 }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByRole('button', { name: '최대' })).toBeDisabled()
  })

  /* ---------- 예약 매도 수동화(2026-08-21 재설계) — 손절·익절을 겪는 자리 ---------- */

  /** 보유 중(예약 없음) 상태를 그리고, 예약 매도 탭까지 열어 준다. */
  async function renderHoldingAndOpenReservation(
    currentAttempt = attempt({ riskSnapshot: risk }),
    currentProgress: InvestmentPracticeResponse = progress(holdingEvidence()),
  ) {
    const view = renderFlow(currentAttempt, currentProgress)
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))
    return view
  }

  it('매수해서 보유가 생겼는데 예약이 없으면 지금 걸어야 한다고 눈에 띄게 안내한다', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
    await flushPromises()

    expect(screen.getByText('아직 팔 기준이 없습니다')).toBeInTheDocument()
    expect(
      screen.getByText('값이 흔들리기 전인 지금이 가장 냉정하게 정할 수 있는 때입니다.'),
    ).toBeInTheDocument()
    // 자체 3칸("1. 사기 › 2. 예약 걸기 › 3. 기다리기")은 여섯 번째 번호 체계라 지웠다.
    expect(screen.queryByText('2. 예약 걸기')).not.toBeInTheDocument()
  })

  it('안내의 "손절·익절 예약 열기"를 누르면 예약 탭이 열린다', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
    await flushPromises()

    expect(screen.queryByLabelText('손절 비율 (−%)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약 열기' }))

    expect(screen.getByLabelText('손절 비율 (−%)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '예약 걸기' })).toBeInTheDocument()
  })

  it('예약 폼은 실전 예약 매도 탭과 같은 자유 입력 두 칸이고, 하한이 아니라 서버가 든 값을 제안한다', async () => {
    // 익절 하한(3)은 학습 순서 여유가 0.96%p뿐이라(백엔드 전수 조사) 화면이 그 가장자리를 권하면 안 된다.
    await renderHoldingAndOpenReservation()

    expect(screen.getByLabelText('손절 비율 (−%)')).toHaveValue('3')
    expect(screen.getByLabelText('익절 비율 (+%)')).toHaveValue('5')
    expect(screen.getByLabelText('손절 비율 (−%)')).toHaveAttribute('placeholder', '3')
    expect(screen.getByLabelText('익절 비율 (+%)')).toHaveAttribute('placeholder', '5')
    expect(screen.queryByText('조심스럽게')).not.toBeInTheDocument()
  })

  it('서버가 준 범위를 입력 안내로 그대로 보여준다 (숫자를 화면에 박아 두지 않는다)', async () => {
    await renderHoldingAndOpenReservation(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      exitRateBounds: { stopLossMin: 1, stopLossMax: 4, takeProfitMin: 2, takeProfitMax: 6 },
    })

    expect(screen.getByText('1~4% 중에서')).toBeInTheDocument()
    expect(screen.getByText('2~6% 중에서')).toBeInTheDocument()
  })

  it('정한 폭이 무슨 뜻인지와 지금 수량이면 얼마인지를 예약 자리에서 말해 준다', async () => {
    await renderHoldingAndOpenReservation()

    fireEvent.change(screen.getByLabelText('손절 비율 (−%)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('익절 비율 (+%)'), { target: { value: '8' } })

    // 의미 문구(좁게/넓게)와 금액이 나란히 두 줄이면 한 칸 아래 문장이 둘이 된다 — 숫자가 이미 말한다.
    expect(screen.queryByText(/좁게 잡았습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/넓게 잡았습니다/)).not.toBeInTheDocument()
    // 기준가는 현재가가 아니라 평균 매수가(10,000) — 2개 보유이므로 손절 -2%면 400원이다.
    expect(screen.getByText(/9,800원에 닿으면 자동으로 정리됩니다 — 지금 가진 수량이면 약 400원을 잃습니다/)).toBeInTheDocument()
    expect(screen.getByText(/10,800원에 닿으면 자동으로 정리됩니다 — 지금 가진 수량이면 약 1,600원을 법니다/)).toBeInTheDocument()
  })

  it('손절 5 + 익절 3 같은 조합도 그대로 예약한다 (두 비율은 서로 독립이고 손절도 양수다)', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()), onRefresh)
    await flushPromises()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))

    fireEvent.change(screen.getByLabelText('손절 비율 (−%)'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('익절 비율 (+%)'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 걸기' }))

    // 손절도 양수 퍼센트 수로 보낸다 — 여기서 부호를 뒤집으면 서버가 정반대 선을 만든다.
    await waitFor(() => expect(createPracticeExitPlan).toHaveBeenCalledWith('CRYPTO', 5, 3))
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
  })

  it('범위 밖 값이면 예약을 걸 수 없고 그 자리에 이유를 보여준다', async () => {
    await renderHoldingAndOpenReservation()

    fireEvent.change(screen.getByLabelText('손절 비율 (−%)'), { target: { value: '9' } })

    expect(await screen.findByText('손절 비율은 2%에서 5% 사이로 정해 주세요.')).toBeInTheDocument()
    // 버튼 아래 줄은 같은 문장을 되풀이하지 않는다 — 두 개의 다른 문제로 읽히면 안 된다.
    expect(screen.getByText('두 비율을 범위 안에서 정해야 예약을 걸 수 있습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '예약 걸기' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '예약 걸기' }))
    expect(createPracticeExitPlan).not.toHaveBeenCalled()
  })

  it('예약을 걸면 무엇을 기다리는 중인지 가격으로 말해 주고 차트에 확정선을 그린다', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      pendingExitPlan: exitPlan,
    })
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByText('이제 당신이 판단할 일은 없습니다')).toBeInTheDocument()
    // 가격 숫자는 차트 점선·차트 요약 둘만 말한다 — 안내 본문에서는 뺐다(같은 값이 다섯 곳에 있었다).
    expect(
      screen.getByText('옆 차트의 점선 두 개 중 먼저 닿는 쪽에서 규칙이 대신 팝니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('3. 기다리기')).not.toBeInTheDocument()
    // "예상"이 아니라 확정선이다.
    expect(screen.getByText('손절 -3% 9700')).toBeInTheDocument()
    expect(screen.getByText('익절 +5% 10500')).toBeInTheDocument()
  })

  it('아직 안 건 값도 차트에 예상선으로 그려 준다 — 걸기 전에 폭을 눈으로 판단하는 자리다', async () => {
    await renderHoldingAndOpenReservation()

    fireEvent.change(screen.getByLabelText('손절 비율 (−%)'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('익절 비율 (+%)'), { target: { value: '6' } })

    // 기준가는 평균 매수가 10,000원이다(현재가가 아니다).
    expect(screen.getByText('예상 손절 -4% 9600')).toBeInTheDocument()
    expect(screen.getByText('예상 익절 +6% 10600')).toBeInTheDocument()
  })

  it('걸어 둔 예약은 취소할 수 있고, 취소하면 다시 걸라고 말해 준다', async () => {
    const view = renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      pendingExitPlan: exitPlan,
    })
    await flushPromises()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }))

    // 되돌릴 수 없는 동작이라 한 번 물어본다 — 서버는 한 매수분에 예약을 한 번만 허용하고,
    // 취소해도 그 한 번이 소모된다. 궁금해서 눌러 본 사람이 손절·익절을 영영 못 겪으면 안 된다.
    expect(screen.getByText('예약을 취소할까요?')).toBeInTheDocument()
    expect(cancelExitPlan).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: '예약 취소' })[1])

    // 튜토리얼 전용 취소 API가 아니라 실전과 같은 경로를 쓴다.
    await waitFor(() => expect(cancelExitPlan).toHaveBeenCalledWith(77))

    // 취소가 반영된 진행 조회가 오면(예약 없음 + 이 진입에는 더 못 검) 그 사실을 조용히 넘기지 않는다.
    view.rerender(
      <MemoryRouter>
        <AttemptTutorialFlow
          market="CRYPTO"
          attempt={attempt({ riskSnapshot: risk })}
          progress={{
            ...progress(holdingEvidence()),
            pendingExitPlan: null,
            exitPlanCreatable: false,
          }}
          onAttemptChange={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    )
    await flushPromises()

    expect(screen.getByText('기준은 들고 있는 동안 고치지 않습니다')).toBeInTheDocument()
    expect(screen.getByText(/방금 예약을 취소했습니다/)).toBeInTheDocument()
  })

  it('서버가 예약 가격을 문자열로 내려줘도 금액 문구가 깨지지 않는다', async () => {
    // 백엔드 예시 응답은 BigDecimal을 "9700.00000000" 문자열로 싣는다 — 그대로 계산하면 문자열
    // 연결이 되어 금액이 통째로 망가진다. 읽는 자리(readPendingExitPlan)에서 숫자로 강제한다.
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      pendingExitPlan: {
        ...exitPlan,
        stopLossPrice: '9700.00000000' as unknown as number,
        takeProfitPrice: '10500.00000000' as unknown as number,
      },
    })
    await flushPromises()

    expect(screen.getByText('이제 당신이 판단할 일은 없습니다')).toBeInTheDocument()
    // 문자열 그대로 계산했다면 차트 기준선과 예약 카드의 금액이 통째로 망가진다.
    expect(screen.getByText('손절 -3% 9700')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))
    expect(screen.getByText('손절 -3% · 9,700원')).toBeInTheDocument()
    expect(screen.getByText('익절 +5% · 10,500원')).toBeInTheDocument()
  })

  it('취소한 진입에는 다시 걸 수 없다는 것을 말해 준다 — "다시 걸어 주세요"라고 하지 않는다', async () => {
    // 예약은 한 진입에 한 번뿐이다(백엔드 확정, write-once). 취소하면 보유 중이고 예약도 없지만
    // exitPlanCreatable이 false라, 이때 "지금 예약을 걸어야 합니다"라고 말하면 누를 때마다 409다.
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      pendingExitPlan: null,
      exitPlanCreatable: false,
    })
    await flushPromises()

    expect(screen.getByText('기준은 들고 있는 동안 고치지 않습니다')).toBeInTheDocument()
    expect(screen.queryByText('아직 팔 기준이 없습니다')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '손절·익절 예약 열기' })).not.toBeInTheDocument()
    // 걸 수 없는 상태에서 "예약해 두면 겪을 수 있다"고 권하지도 않는다.
    expect(screen.queryByText(/지금 누르면 규칙이 아니라 당신이 파는 것입니다/)).not.toBeInTheDocument()

    // 탭을 직접 열면 입력 칸 대신 이유가 보인다 — 눌리지 않는 폼을 남겨 두지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))
    expect(screen.queryByLabelText('손절 비율 (−%)')).not.toBeInTheDocument()
    expect(screen.getByText(/그 자리를 막으려고 한 진입에 한 번만 걸리고/)).toBeInTheDocument()
  })

  it('예약 탭에서도 "예약하지 않고 지금 팔기"로 되돌아갈 수 있다 (길을 막지 않는다)', async () => {
    await renderHoldingAndOpenReservation()

    fireEvent.click(screen.getByRole('button', { name: '예약하지 않고 지금 팔기' }))

    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeInTheDocument()
    expect(screen.queryByLabelText('손절 비율 (−%)')).not.toBeInTheDocument()
  })

  it('손절을 겪고 다시 샀는데 예약이 없으면, 걸라고 하면서 이번엔 익절 차례임을 함께 말한다', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      // 1회차는 손절로 정리됐고, 2회차 진입은 아직 안 팔린 상태다.
      entries: [entry({ sellCause: 'STOP_LOSS' }), entry({ entrySequence: 2, sellAt: null, sellCause: null, sellPrice: null, sellQuantity: null, realizedPnl: null })],
    })
    await flushPromises()

    expect(screen.getByText('아직 팔 기준이 없습니다')).toBeInTheDocument()
    // 남은 목표는 국면 본문이 아니라 상단 목표 칸이 말한다 — 한 국면의 문장은 하나다. 손절만
    // 겪은 지금은 손절·익절 겪기가 아직 안 채워졌다(2026-08-24 — 둘을 한 칸으로 합쳤다).
    const goalRail = screen.getByLabelText('오늘의 목표')
    expect(within(goalRail).getByText('손절·익절 겪기')).toBeInTheDocument()
    expect(within(goalRail).queryByText('✓ 손절·익절 겪기')).not.toBeInTheDocument()
  })

  it('예약 생성이 거부되면 그 자리에 이유를 보여준다', async () => {
    vi.mocked(createPracticeExitPlan).mockRejectedValue(
      new ApiError(409, 'PRACTICE_STEP_LOCKED', null, null),
    )
    await renderHoldingAndOpenReservation()

    fireEvent.click(screen.getByRole('button', { name: '예약 걸기' }))

    expect(await screen.findByText(/먼저 이전 단계를 완료해야 합니다/)).toBeInTheDocument()
  })

  it('중복 예약 거부는 공용 문구("취소한 뒤 다시")를 쓰지 않는다 — 튜토리얼에서는 거짓말이다', async () => {
    vi.mocked(createPracticeExitPlan).mockRejectedValue(
      new ApiError(409, 'EXIT_PLAN_ALREADY_EXISTS', null, null),
    )
    await renderHoldingAndOpenReservation()

    fireEvent.click(screen.getByRole('button', { name: '예약 걸기' }))

    expect(
      await screen.findByText(/취소한 예약도 같은 진입에서는 다시 걸 수 없어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/취소한 뒤 다시 시도해 주세요/)).not.toBeInTheDocument()
  })

  it('예약 없이 그냥 팔 수도 있지만, 그러면 무엇을 건너뛰는지 말해 준다 (잠그지는 않는다)', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
    await flushPromises()

    expect(
      screen.getByText(/지금 누르면 규칙이 아니라 당신이 파는 것입니다/),
    ).toBeInTheDocument()
    // 강도 (b) — 안내만 하고 매도 버튼은 그대로 눌린다.
    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeEnabled()
  })

  it('예약을 걸어 두면 "지금 팔면 못 겪는다" 안내를 더 이상 보여주지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holdingEvidence()),
      pendingExitPlan: exitPlan,
    })
    await flushPromises()

    expect(screen.queryByText(/지금 누르면 규칙이 아니라 당신이 파는 것입니다/)).not.toBeInTheDocument()
  })

  it('예약 없이 직접 팔고 나면 손절·익절을 아직 못 겪었다고 알려준다', async () => {
    const sold = evidence({ buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 0 })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      entries: [entry({ sellCause: 'MANUAL' })],
    })
    await flushPromises()

    expect(
      screen.getByText('규칙이 아니라 당신이 팔았습니다'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('오늘의 목표')).toHaveTextContent('손절·익절 겪기')
  })

  it('손절만 겪었으면 이제 익절을 겪을 차례라고 다음 할 일을 말해 준다', async () => {
    const sold = evidence({ buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 0 })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      entries: [entry({ sellCause: 'STOP_LOSS' })],
    })
    await flushPromises()

    expect(screen.getByText('손절을 겪었습니다')).toBeInTheDocument()
    expect(screen.getByText('이제 익절을 겪어 볼 차례입니다.')).toBeInTheDocument()
    // 다음 할 일은 이 문장이 말하고, 위 요약 칸(손절·익절 겪기)은 둘 다 겪기 전엔 체크되지 않는다.
    expect(
      within(screen.getByLabelText('오늘의 목표')).queryByText('✓ 손절·익절 겪기'),
    ).not.toBeInTheDocument()
  })

  it('둘 다 겪으면 목표를 다 채웠다고 말한다', async () => {
    const sold = evidence({ buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 0 })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      entries: [entry({ sellCause: 'STOP_LOSS' }), entry({ entrySequence: 2, sellCause: 'TAKE_PROFIT' })],
    })
    await flushPromises()

    expect(screen.getByText('손절과 익절을 다 겪었습니다')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('오늘의 목표')).getByText('✓ 손절·익절 겪기'),
    ).toBeInTheDocument()
  })

  it('서버가 경험 판정을 내려주면 진입 기록 폴백 대신 그 값을 따른다', async () => {
    const sold = evidence({ buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 0 })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      // 진입 기록은 손절이라고 말하지만 서버는 익절이라고 말한다 — 서버가 이긴다.
      entries: [entry({ sellCause: 'STOP_LOSS' })],
      exitExperience: {
        stopLossExperienced: false,
        takeProfitExperienced: true,
        bothExperienced: false,
        recommendedNext: 'STOP_LOSS',
      },
    })
    await flushPromises()

    expect(screen.getByText('익절을 겪었습니다')).toBeInTheDocument()
    expect(screen.getByText('이제 손절을 겪어 볼 차례입니다.')).toBeInTheDocument()
    // 서버 판정으로는 아직 하나뿐이라 요약 칸은 체크되지 않는다.
    expect(
      within(screen.getByLabelText('오늘의 목표')).queryByText('✓ 손절·익절 겪기'),
    ).not.toBeInTheDocument()
  })

  it('아직 아무것도 안 샀으면 먼저 사라고만 말한다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()

    expect(screen.getByText('먼저 삽니다')).toBeInTheDocument()
    expect(screen.queryByText('1. 사기')).not.toBeInTheDocument()
  })

  it('주식 튜토리얼에는 예약 매도가 없어 학습 안내도 그리지 않는다 — 걸 방법이 없는 화면이다', async () => {
    renderFlow(
      attempt({ market: 'STOCK', riskSnapshot: risk }),
      progress(holdingEvidence()),
    )
    await flushPromises()

    expect(screen.queryByLabelText('손절·익절 학습 진행')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '손절·익절 예약(자동 매도)' })).not.toBeInTheDocument()
  })

  it('2단계 학습 체크리스트를 서버 판정 그대로 보여주되, 그 국면에서만 그린다 (이슈 #503)', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ORDER_BASICS',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    renderFlow(
      attempt({ riskSnapshot: null }),
      progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
        marketBuySellCompleted: true,
        limitBuySellCompleted: false,
        exitPresetSelected: true,
      }),
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    // "오늘의 목표"에도 같은 이름의 칩이 있어(2026-08-24) 전역 조회로는 둘 다 걸린다 —
    // 체크리스트 자체 영역으로 좁혀서 확인한다.
    const checklist = screen.getByLabelText('주문 방법 학습 체크리스트')
    expect(within(checklist).getByText('✓ 시장가 매매')).toBeInTheDocument()
    expect(within(checklist).getByText('지정가 매매')).toBeInTheDocument()
    expect(within(checklist).queryByText('✓ 지정가 매매')).not.toBeInTheDocument()
    // 세 번째 칩("손절·익절 기준 정하기")은 이 국면에서 달성 자체가 불가능해 빼고, 그 목표는
    // 상단 "오늘의 목표"와 예약 국면이 대신 말한다.
    expect(within(checklist).queryByText(/손절·익절 기준 정하기/)).not.toBeInTheDocument()
  })

  it('2단계를 벗어나면 체크리스트를 더 그리지 않는다 (예약을 거는 국면의 할 일이 아니다)', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ACT1',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.queryByLabelText('주문 방법 학습 체크리스트')).not.toBeInTheDocument()
  })

  it('손절·익절로 자동 정리된 매도가 있는데도 시장가 매매가 미완료면 그 이유를 알려준다 (실사용 중 발견)', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ORDER_BASICS',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    renderFlow(
      attempt({ riskSnapshot: null }),
      {
        ...progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: false,
          limitBuySellCompleted: false,
          exitPresetSelected: true,
        }),
        entries: [
          {
            entrySequence: 1,
            exitPreset: 'BALANCED',
            buyOrderType: 'MARKET',
            scenarioScriptId: 'CRYPTO_STORY_V1',
            buyAt: '2026-08-20T11:00:00',
            buyPrice: 10000,
            buyQuantity: 2,
            stopLossPrice: 9700,
            takeProfitPrice: 10500,
            sellPrice: 9700,
            sellQuantity: 2,
            sellAt: '2026-08-20T11:12:00',
            sellCause: 'STOP_LOSS',
            realizedPnl: -600,
            unrealizedPnlIfHeld: null,
          },
        ],
      },
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(
      screen.getByText(/손절·익절로 자동 정리된 매도는 "시장가 매매"로 세지 않습니다/),
    ).toBeInTheDocument()
  })

  it('사용자가 직접 판 매도만 있으면(자동 정리 없음) 시장가 매매 안내를 보여주지 않는다', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ORDER_BASICS',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    renderFlow(
      attempt({ riskSnapshot: null }),
      progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
        marketBuySellCompleted: false,
        limitBuySellCompleted: false,
        exitPresetSelected: false,
      }),
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.queryByText(/손절·익절로 자동 정리된 매도는/)).not.toBeInTheDocument()
  })

  it('규칙 설명은 상시 카드가 아니라 예약을 거는 순간 한 번만 뜬다', async () => {
    // 예전에는 차트 아래 상시 큰 카드로 다섯 문단이 깔려 있어, 정작 판단해야 할 예약 카드가
    // 스크롤 밖으로 밀렸다. 설명이 필요한 시점은 예약을 거는 그 순간 하나뿐이다.
    vi.mocked(createPracticeExitPlan).mockResolvedValue(undefined as never)
    renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
    await flushPromises()
    expect(screen.queryByText('이 선에 닿으면 규칙이 대신 팝니다')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 걸기' }))
    await flushPromises()

    expect(await screen.findByText('이 선에 닿으면 규칙이 대신 팝니다')).toBeInTheDocument()
    expect(
      screen.getByText('값이 움직이는 동안 판단하지 않으려고, 아무 일도 없는 지금 미리 정해 두는 두 선이에요.'),
    ).toBeInTheDocument()
    // 승률 계산은 접힌 채로 둔다 — 이 순간에 읽을 문장은 한 줄이다.
    expect(screen.getByText('이 숫자는 왜 이렇게 정하나요?')).toBeInTheDocument()
  })

  it('주식 튜토리얼의 목표 두 칸은 손절·익절이 아니라 사보기·팔아보기다 (예약 경로가 코인 전용이다)', async () => {
    renderFlow(
      attempt({ market: 'STOCK', instrumentId: 801, riskSnapshot: null }),
      {
        ...progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: false,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
        tutorialKey: 'INVESTMENT_PRACTICE_V1',
      },
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalledWith('STOCK'))

    // 손절·익절 목표를 걸어 두면 주식에서는 영영 안 채워진다 — 끝나지 않는 약속이 된다.
    const stockGoals = screen.getByLabelText('오늘의 목표')
    expect(within(stockGoals).getByText('사보기')).toBeInTheDocument()
    expect(within(stockGoals).getByText('팔아보기')).toBeInTheDocument()
    expect(screen.queryByText('손절 겪기')).not.toBeInTheDocument()
    expect(screen.queryByText(/지정가 매매/)).not.toBeInTheDocument()
  })

  describe('049 — 2단계(ORDER_BASICS) 대본', () => {
    function orderBasicsChart(overrides: Partial<PracticeTutorialChartResponse> = {}) {
      return {
        ...chart,
        scenarioStage: 'ORDER_BASICS' as const,
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN' as const,
        priceGuideRange: { low: 90_000, high: 110_000 },
        ...overrides,
      }
    }

    it('ORDER_BASICS에서는 사건 UI 대신 목적 설명과 가격 안내 범위를 보여준다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(attempt({ riskSnapshot: null }), progress())
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(
        screen.getByText('지금은 주문 방법을 연습하는 자리입니다 — 사건은 없습니다'),
      ).toBeInTheDocument()
      expect(screen.getByText(/90,000원~110,000원 사이에서 움직입니다/)).toBeInTheDocument()
      // 사건이 없으므로 이야기 UI(상태 줄의 "이야기가 진행 중입니다" 문구)는 뜨지 않는다.
      expect(screen.queryByText(/이야기가 진행 중입니다/)).not.toBeInTheDocument()
      expect(screen.queryByText('지금 무슨 일이')).not.toBeInTheDocument()
    })

    it('priceGuideRange가 null이면(041 이야기 대본) 범위 문구를 붙이지 않는다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue({
        ...chart,
        scenarioStage: 'ACT1',
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN',
        priceGuideRange: null,
      })
      renderFlow(attempt({ riskSnapshot: risk }), progress())
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.queryByText(/사이에서 움직입니다/)).not.toBeInTheDocument()
    })

    it('시장가 왕복 전에는 지정가 토글을 잠그고 이유를 알려준다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: false,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '지정가' })).toBeDisabled()
      expect(
        screen.getByText('시장가로 먼저 한 번 사고팔아 본 뒤에 지정가를 쓸 수 있습니다.'),
      ).toBeInTheDocument()
    })

    it('시장가 왕복을 마치면 지정가 토글이 풀린다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '지정가' })).toBeEnabled()
      expect(
        screen.queryByText('시장가로 먼저 한 번 사고팔아 본 뒤에 지정가를 쓸 수 있습니다.'),
      ).not.toBeInTheDocument()
    })

    it('시장가 왕복을 마쳤는데 지정가가 아직이면 시장가 토글을 잠그고 지정가 차례임을 알려준다', async () => {
      // 자유 토글로 두면 시장가만 반복하고 지정가를 건너뛴 채 "다 했다"고 착각하기 쉽다(피드백).
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '시장가' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '지정가' })).toBeEnabled()
      expect(
        screen.getByText('시장가는 다 해 봤습니다. 이번엔 지정가로 사고팔아 볼 차례입니다.'),
      ).toBeInTheDocument()
      expect(screen.getByText('지금 할 일 · 지정가로 사고팔아 보기')).toBeInTheDocument()
    })

    it('두 왕복을 모두 마치면 시장가·지정가 토글이 다시 둘 다 풀린다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '시장가' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '지정가' })).toBeEnabled()
      expect(screen.queryByText(/지금 할 일 ·/)).not.toBeInTheDocument()
    })

    it('"지금 할 일" 팝업은 그 차례에 한 번 뜨고, 닫으면 같은 차례 동안 다시 뜨지 않다가 다음 차례엔 다시 뜬다', async () => {
      // 2026-08-21 피드백 — 상시 카드로 두면 진행 로드맵·체크리스트·주문 폼과 겹쳐 헷갈린다,
      // 그 차례에 들어선 순간 한 번만 큰 팝업으로 띄우고 없애자.
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      const view = renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: false,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      const marketDialog = await screen.findByRole('dialog')
      expect(
        within(marketDialog).getByRole('heading', { name: '지금 할 일 · 시장가로 사고팔아 보기' }),
      ).toBeInTheDocument()

      fireEvent.click(within(marketDialog).getByRole('button', { name: '확인했어요' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // 같은 차례(시장가 미완료)로 다시 렌더해도 이미 닫았으니 다시 뜨지 않는다.
      view.rerender(
        <MemoryRouter>
          <AttemptTutorialFlow
            market="CRYPTO"
            attempt={attempt({ riskSnapshot: null })}
            progress={progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
              marketBuySellCompleted: false,
              limitBuySellCompleted: false,
              exitPresetSelected: false,
            })}
            onAttemptChange={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
          />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // 시장가 왕복이 끝나 지정가 차례로 바뀌면 새 차례라 다시 뜬다.
      view.rerender(
        <MemoryRouter>
          <AttemptTutorialFlow
            market="CRYPTO"
            attempt={attempt({ riskSnapshot: null })}
            progress={progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
              marketBuySellCompleted: true,
              limitBuySellCompleted: false,
              exitPresetSelected: false,
            })}
            onAttemptChange={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
          />
        </MemoryRouter>,
      )
      const limitDialog = await screen.findByRole('dialog')
      expect(
        within(limitDialog).getByRole('heading', { name: '지금 할 일 · 지정가로 사고팔아 보기' }),
      ).toBeInTheDocument()
    })

    it('2단계에서는 손절·익절 설명·비율 입력 카드를 아예 그리지 않는다', async () => {
      // 자동 청산 예약 자체가 백엔드에서 2단계엔 안 만들어진다(049 ORDERBASICS-022) — "값이 선에
      // 닿으면 자동으로 팔립니다" 문구를 disabled로만 남겨 두면 사실과 다른 문장이 계속 보이고,
      // "우리는 그냥 사고팔아 보는 거 아니었냐"는 혼란도 남는다(2026-08-21 피드백). 카드 자체를 뺀다.
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.queryByLabelText('손절 비율 (−%)')).not.toBeInTheDocument()
      expect(
        screen.queryByText(/사는 순간의 값을 기준으로 팔 기준선 두 개/),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(/이 단계는 주문 방법을 배우는 자리라 손절·익절은 다음 단계에서 다룹니다/),
      ).not.toBeInTheDocument()
    })

    it('2단계에서는 예약 매도 탭을 잠그고 다음 단계에서 다룬다고 이유를 말한다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: risk }),
        progress(holdingEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' })).toBeDisabled()
      expect(
        screen.getByText(/지금은 주문 방법을 배우는\s*단계라, 다음 단계에서 직접 걸어 봅니다/),
      ).toBeInTheDocument()
      // 2단계에는 학습 안내(예약을 걸라는 말)도 그리지 않는다 — 아직 그 차례가 아니다.
      expect(screen.queryByLabelText('손절·익절 학습 진행')).not.toBeInTheDocument()
    })

    it('3단계(스토리)로 넘어가면 예약 매도 탭이 풀린다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue({
        ...chart,
        scenarioStage: 'ACT1',
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN',
        priceGuideRange: null,
      })
      renderFlow(
        attempt({ riskSnapshot: risk }),
        progress(holdingEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' })).toBeEnabled()
      expect(screen.getByText('아직 팔 기준이 없습니다')).toBeInTheDocument()
    })

    // 예전에는 사용자가 주문 컬럼 아래쪽 CTA를 찾아 눌러야 넘어갔다. 지정가 왕복을 끝낸 자리에서
    // 위로 스크롤해 버튼을 찾아야 하는 게 실사용에서 막힘으로 드러나(2026-08-21) 자동 전환으로 바꿨다.
    it('시장가·지정가 왕복을 모두 마치면 누르지 않아도 3단계로 넘어간다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      vi.mocked(advancePracticeAttemptScript).mockResolvedValue(attempt({ riskSnapshot: null }))
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      await waitFor(() => expect(advancePracticeAttemptScript).toHaveBeenCalledWith('CRYPTO'))
    })

    // 3초 폴링이 같은 조건을 계속 만족시키므로, 한 번만 시도한다는 것이 계약이다.
    it('자동 전환은 조건이 계속 참이어도 한 번만 부른다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      vi.mocked(advancePracticeAttemptScript).mockResolvedValue(attempt({ riskSnapshot: null }))
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(advancePracticeAttemptScript).toHaveBeenCalledTimes(1))
      await flushPromises()
      await flushPromises()

      expect(advancePracticeAttemptScript).toHaveBeenCalledTimes(1)
    })

    it('둘 중 하나만 마쳤으면 "3단계로 가기" 버튼이 뜨지 않는다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: false,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.queryByRole('button', { name: '다음으로 · 팔 기준 정하기' })).not.toBeInTheDocument()
    })

    it('보유 중에는 조건을 다 채웠어도 "3단계로 가기" 버튼을 보여주지 않는다', async () => {
      // 서버가 순보유수량 > 0이면 409로 거부한다 — 버튼을 눌러도 실패할 걸 미리 안 보여준다.
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      const holding = evidence({
        buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
      })
      renderFlow(
        attempt({ riskSnapshot: risk }),
        progress(holding, 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      expect(screen.queryByRole('button', { name: '다음으로 · 팔 기준 정하기' })).not.toBeInTheDocument()
    })

    it('전환 뒤 커서를 새로 받으려고 tick을 한 번 더 부른다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      vi.mocked(advancePracticeAttemptScript).mockResolvedValue(attempt({ riskSnapshot: null }))
      vi.mocked(tickPracticeAttempt).mockResolvedValue({
        ...chart,
        scenarioStage: 'ACT1',
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN',
        priceGuideRange: null,
      })
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      await waitFor(() => expect(advancePracticeAttemptScript).toHaveBeenCalledWith('CRYPTO'))
      await waitFor(() => expect(tickPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
      // 전환 뒤 커서가 반영돼 이제 이야기 상태 줄(ACT1)이 보여야 한다 — 2단계 문구는 사라진다.
      await waitFor(() =>
        expect(
          screen.queryByText('지금은 주문 방법을 연습하는 자리입니다 — 사건은 없습니다'),
        ).not.toBeInTheDocument(),
      )
    })

    it('전환이 409로 거부되면 그 자리에 오류를 보여준다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue(orderBasicsChart())
      vi.mocked(advancePracticeAttemptScript).mockRejectedValue(
        new ApiError(409, 'PRACTICE_STAGE_LOCKED', null, null),
      )
      renderFlow(
        attempt({ riskSnapshot: null }),
        progress(evidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, {
          marketBuySellCompleted: true,
          limitBuySellCompleted: true,
          exitPresetSelected: false,
        }),
      )
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      fireEvent.click(screen.getByRole('button', { name: '다음으로 · 팔 기준 정하기' }))

      expect(await screen.findByText('먼저 앞 단계를 마쳐야 합니다. 화면의 체크리스트를 확인해 주세요.')).toBeInTheDocument()
      expect(tickPracticeAttempt).not.toHaveBeenCalled()
    })
  })

  it('예상 손익 금액은 입력하는 그 자리 한 곳에서만 말한다 (두 곳이 각자 계산하지 않는다)', async () => {
    // 예전에는 차트 아래 카드와 입력 칸이 같은 금액을 각자 계산하고 한쪽만 "수수료 제외"를 붙여,
    // 같은 숫자가 다른 근거처럼 읽혔다. 정본은 실제로 걸 값을 입력하는 자리 하나다.
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()
    fireEvent.click(screen.getByRole('button', { name: '손절·익절 예약(자동 매도)' }))

    // entry 10,000 / 손절 3% / 익절 5% · 2개 → 600원 손실, 1,000원 이익.
    expect(
      screen.getByText(/9,700원에 닿으면 자동으로 정리됩니다 — 지금 가진 수량이면 약 600원을 잃습니다/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/10,500원에 닿으면 자동으로 정리됩니다 — 지금 가진 수량이면 약 1,000원을 법니다/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/갖고 있으니, 손절선에 닿으면/)).not.toBeInTheDocument()
  })

  it('수량이 null이면 0개라고 지어내지 않고 개수를 생략하며 매도를 잠근다', async () => {
    // 완료한 시장을 재시작하면 서버가 예전 완료 응답을 돌려줘 수량 3종이 전부 null로 온다(실측).
    // 체결가와 손절·익절선은 정상이라 수량만 비어 있다 — `?? 0`이면 "0개를 샀습니다"라는 거짓말이 된다.
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: null,
      sellQuantity: null,
      remainingQuantity: null,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.queryByText(/0개/)).not.toBeInTheDocument()

    const sell = screen.getByRole('button', { name: '가진 만큼 전부 판매하기' })
    expect(sell).toBeDisabled()
    // 수량을 모르는 게 진짜 이유다 — "잠시 뒤 팔 수 있어요"는 오지 않을 일을 약속하는 문구라 띄우지 않는다.
    expect(screen.queryByText('가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.')).not.toBeInTheDocument()
    expect(screen.getByText(/지금 가진 수량을 불러오지 못했습니다/)).toBeInTheDocument()
    // 금액 문장도 수량을 모르면 통째로 생략한다.
    expect(screen.queryByText(/갖고 있으니/)).not.toBeInTheDocument()
  })

  it('관찰이 인정되면 매도 버튼이 풀리고 잠금 안내가 사라진다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeEnabled()
    expect(screen.queryByText('가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.')).not.toBeInTheDocument()
    expect(screen.getByText('확인 완료')).toBeInTheDocument()
  })

  it('관찰 evidence가 붙을 때까지 tick 주기마다 관찰을 반복해 기록한다', async () => {
    // 매수 직후 1회만 기록하면 서버의 evidence B(2분 범위 3회)는 구조적으로 불가능하고 A는 가격 운에
    // 달린다 — 실제로 이 때문에 튜토리얼이 완료 불가로 막히는 것을 재현했다.
    vi.useFakeTimers()
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 4; i += 1) {
      await act(async () => vi.advanceTimersByTime(3000))
      await flushPromises()
    }

    // tick 2번마다 한 번씩 — 4 tick이면 2번 더 쌓인다.
    expect(recordHoldingObservation).toHaveBeenCalledTimes(3)
    expect(recordHoldingObservation).toHaveBeenLastCalledWith(41)
  })

  it('evidence 없이 전량 매도된 상태에서도 tick마다 관찰을 계속 기록해 스스로 복구한다', async () => {
    // 백엔드 #423 이후 매도 뒤의 관찰도 정상 접수된다(201이지만 evidenceType은 null). 조건 B를 채울
    // 때까지 쌓는 것이 evidence 없이 팔려 버린 사용자의 유일한 복구 경로다 — fullySold로 막으면
    // 4단계가 잠긴 채 빠져나올 길이 없다(프로덕션 재현).
    vi.useFakeTimers()
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, buyQuantity: 10, sellQuantity: 10, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 4; i += 1) {
      await act(async () => vi.advanceTimersByTime(3000))
      await flushPromises()
    }

    expect(recordHoldingObservation).toHaveBeenCalledTimes(3)
    expect(recordHoldingObservation).toHaveBeenLastCalledWith(41)
  })

  it('복구가 도는 동안 진행 중임을 알리고 복기 저장을 잠근다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, buyQuantity: 10, sellQuantity: 10, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByText('가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.')).toBeInTheDocument()
    // 관찰이 인정되기 전에 "지켜보기 완료"라고 쓰면 거짓이다 — 실제로 4단계는 아직 잠겨 있다.
    expect(screen.queryByText(/3\. 지켜보기 완료/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'), {
      target: { value: '한 줄 기록' },
    })
    // 지금 누르면 PRACTICE_EVIDENCE_MISSING으로 반드시 실패한다 — 실패 문구 대신 잠그고 이유를 말한다.
    expect(screen.getByRole('button', { name: '적은 내용 저장하고 끝내기' })).toBeDisabled()
    expect(screen.getByText('가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.')).toBeInTheDocument()
  })

  it('관찰 evidence가 이미 붙었으면 tick이 돌아도 더 기록하지 않는다', async () => {
    vi.useFakeTimers()
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    for (let i = 0; i < 6; i += 1) {
      await act(async () => vi.advanceTimersByTime(3000))
      await flushPromises()
    }

    expect(recordHoldingObservation).not.toHaveBeenCalled()
  })

  it('매수 체결로 holding이 생기면 버튼 없이 곧바로 첫 관찰을 기록한다', async () => {
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)
    expect(recordHoldingObservation).toHaveBeenCalledWith(41)
    expect(screen.queryByRole('button', { name: '현재 가격 관찰 기록' })).not.toBeInTheDocument()

    // tick 을 돌리지 않았으므로 반복 관찰도 아직 일어나지 않는다.
    await flushPromises()
    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)
  })

  it('자동 관찰 기록이 계속 실패하면 내부적으로 두 번 더 자동 재시도한 뒤에만 재시도 버튼을 보여준다', async () => {
    vi.useFakeTimers()
    vi.mocked(recordHoldingObservation).mockRejectedValue(new Error('network'))
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()
    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '관찰 다시 시도' })).not.toBeInTheDocument()

    // 매수 직후 서버 evidence 반영 지연을 흡수하려고 짧게 쉬었다 자동으로 최대 2번 더 시도한다.
    await act(async () => vi.advanceTimersByTime(1500))
    await flushPromises()
    expect(recordHoldingObservation).toHaveBeenCalledTimes(2)

    await act(async () => vi.advanceTimersByTime(1500))
    await flushPromises()
    expect(recordHoldingObservation).toHaveBeenCalledTimes(3)

    const retry = screen.getByRole('button', { name: '관찰 다시 시도' })

    vi.mocked(recordHoldingObservation).mockResolvedValueOnce({} as never)
    fireEvent.click(retry)
    await flushPromises()

    expect(recordHoldingObservation).toHaveBeenCalledTimes(4)
    expect(screen.queryByRole('button', { name: '관찰 다시 시도' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('전량 매도로 관찰 카드가 사라져도 재시도 버튼은 화면에 남는다', async () => {
    // 재시도 버튼이 !fullySold 카드 안에 있으면, 오류가 시키는 행동을 할 버튼이 화면에서 사라진다.
    vi.useFakeTimers()
    vi.mocked(recordHoldingObservation).mockRejectedValue(new Error('network'))
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()
    await act(async () => vi.advanceTimersByTime(1500))
    await flushPromises()
    await act(async () => vi.advanceTimersByTime(1500))
    await flushPromises()

    expect(screen.queryByRole('button', { name: '가진 0개 전부 판매하기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '관찰 다시 시도' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('매도 제한 시각을 mm:ss 카운트다운으로 상시 보여주고 1분 이하면 재촉한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0))
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: 2,
      remainingQuantity: 2,
      saleDeadlineAt: '2026-08-14T12:05:00',
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    // 카운트다운은 별도 블록이 아니라 상단 "오늘의 목표" 줄에 흡수됐다 — 둘 다 "언제 끝나는가"다.
    const goalRail = screen.getByLabelText('오늘의 목표')
    expect(within(goalRail).getByText('05:00')).toBeInTheDocument()

    // 4분 30초를 흘려보낸다 — 1초 간격 타이머가 그만큼 다시 그린다.
    await act(async () => vi.advanceTimersByTime(270_000))
    expect(within(goalRail).getByText('00:30')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('마감이 없는 대본(saleDeadlineAt=null)에서는 카운트다운도 재촉도 그리지 않는다', async () => {
    // 코인 튜토리얼은 대본이 시계를 정하므로 벽시계 마감이 없다. 시장이 아니라 saleDeadlineAt 로만
    // 판단해야 한다 — 주식은 아직 옛 방식이라 마감 값이 그대로 온다.
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: 2,
      remainingQuantity: 2,
      saleDeadlineAt: null,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence, 'IN_PROGRESS', 'AWAITING_SALE'))
    await flushPromises()

    expect(screen.queryByText(/안에 파는 연습입니다/)).not.toBeInTheDocument()
    // 만료 화면에 도달하지 않으므로 판매 버튼은 그대로 살아 있어야 한다.
    expect(screen.getByRole('button', { name: /판매하기/ })).toBeInTheDocument()
  })

  it('매도 전에는 지금 팔면 얼마인지를 산 값과 현재가로 계산해 보여준다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 1, remainingQuantity: 1,
    })
    // chart 최신 종가 123 vs entryPrice 10000 이라 손실 방향으로 계산된다.
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByText(/1개를 10,000원에 샀고 지금은 123원입니다/)).toBeInTheDocument()
    expect(screen.getByText(/-9,877원/)).toBeInTheDocument()
  })

  it('tradeResult가 오면 산 값·판 값·실현손익과 손실 안내를 보여준다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      sellTradeId: 61,
      buyQuantity: 1,
      sellQuantity: 1,
      remainingQuantity: 0,
      tradeResult: {
        buyPrice: 10000,
        sellPrice: 9600,
        realizedPnl: -400,
        returnRate: -0.04,
        sellVerdict: 'BELOW_STOP_LOSS',
      },
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByText('산 값')).toBeInTheDocument()
    expect(screen.getByText('9,600원')).toBeInTheDocument()
    expect(screen.getByText('-400원')).toBeInTheDocument()
    expect(screen.getByText('손절선 아래에서 직접 파셨습니다.')).toBeInTheDocument()
    expect(screen.getByText(/손실이 났다고 잘못한 게 아닙니다/)).toBeInTheDocument()
  })

  it('tradeResult가 없으면(백엔드 미배포) 손익 블록을 조용히 숨기고 화면이 깨지지 않는다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      sellTradeId: 61,
      buyQuantity: 1,
      sellQuantity: 1,
      remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.queryByText('산 값')).not.toBeInTheDocument()
    expect(screen.getByText(/산 개수 1 · 판 개수 1 · 남은 개수 0/)).toBeInTheDocument()
    // 복기 입력 자체는 정상적으로 열려 있어야 한다.
    expect(screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.')).toBeInTheDocument()
  })

  it('복기 예시 칩을 누르면 입력이 채워지고 그대로 저장할 수 있다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 1, sellQuantity: 1, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '값이 내려갈 때 불안했다' }))
    expect(screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.')).toHaveValue('값이 내려갈 때 불안했다')

    fireEvent.click(screen.getByRole('button', { name: '적은 내용 저장하고 끝내기' }))
    await waitFor(() => expect(saveHoldingReflection).toHaveBeenCalledWith(41, '값이 내려갈 때 불안했다'))
  })

  it('고른 뒤에는 종목 목록을 이름 한 줄로 접는다 (누를 수도 없는 행이 좌측 20%를 차지하지 않는다)', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()

    // 고른 것 외에는 눌리지도 않는 행이었다 — 목록 자체가 사라지고 이름 한 줄만 남는다.
    expect(screen.queryByRole('button', { name: /연습 코인/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('연습 코인').length).toBeGreaterThan(0)
    expect(screen.getByText('고른 종목 · 연습 코인')).toBeInTheDocument()
  })

  it('아직 고르는 중이면 목록을 펼쳐 두고 누를 수 있다', async () => {
    renderFlow(attempt({ status: 'SELECTING_INSTRUMENT', instrumentId: null, riskSnapshot: null }), progress())
    await flushPromises()

    expect(screen.getByRole('button', { name: /연습 코인/ })).toBeEnabled()
    expect(screen.getByText('연습할 종목을 고릅니다')).toBeInTheDocument()
  })

  it('주문 패널은 팔기 전까지 되돌아보기 탭을 잠그고, 다 팔면 그리로 넘어간다', async () => {
    const holding = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    const view = renderFlow(attempt({ riskSnapshot: risk }), progress(holding))
    await flushPromises()

    expect(screen.getByRole('button', { name: '되돌아보기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeInTheDocument()

    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    view.rerender(
      <MemoryRouter>
        <AttemptTutorialFlow
          market="CRYPTO"
          attempt={attempt({ riskSnapshot: risk })}
          progress={progress(sold)}
          onAttemptChange={vi.fn()}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    )
    await flushPromises()

    expect(screen.getByRole('button', { name: '되돌아보기' })).toBeEnabled()
    expect(
      screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'),
    ).toBeInTheDocument()
  })

  it('진행 중인 실행의 되돌아보기는 좁은 탭이 아니라 큰 모달로 뜨고, ESC로 닫으면 주문 탭으로 돌아간다', async () => {
    // 2026-08-21 피드백 — 옆 사이드 패널 탭은 가독성이 떨어진다, 큰 화면으로 띄우고 ESC로 나가게 해 달라.
    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(sold))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '되돌아보기' })).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'),
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '되돌아보기' })).toHaveAttribute('aria-pressed', 'false')

    // 닫았다고 다시 볼 방법이 없어지면 안 된다 — 탭을 다시 누르면 모달이 다시 열린다.
    fireEvent.click(screen.getByRole('button', { name: '되돌아보기' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('진행 중인 실행의 되돌아보기 모달은 X 버튼이나 바깥 클릭으로도 닫힌다', async () => {
    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(sold))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '되돌아보기' }))
    const reopened = await screen.findByRole('dialog')
    // 카드 자체를 눌러서는 안 닫힌다 — 카드를 감싼 어두운 배경(부모 엘리먼트)을 직접 눌러야 닫힌다.
    fireEvent.click(reopened)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(reopened.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('지금 보유 중이면 대본이 안 끝났어도 "직전 진입이 정리됐다"는 재진입 안내를 보여주지 않는다 (실사용 재확인 중 발견)', async () => {
    // progress.entries에는 아직 안 판 진입(지금 보유 중인 것)도 함께 온다 — entries.length > 0만으로
    // "정리됐다"를 판단하면 지금 한창 보유 중일 때도 재진입 안내가 잘못 뜬다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ACT1',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    const holding = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(holding),
      entries: [
        {
          entrySequence: 1,
          exitPreset: 'BALANCED',
          buyOrderType: 'MARKET',
          scenarioScriptId: 'CRYPTO_STORY_V1',
          buyAt: '2026-08-20T11:00:00',
          buyPrice: 10000,
          buyQuantity: 2,
          stopLossPrice: 9700,
          takeProfitPrice: 10500,
          sellPrice: null,
          sellQuantity: null,
          sellAt: null,
          sellCause: null,
          realizedPnl: null,
          unrealizedPnlIfHeld: null,
        },
      ],
    })
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeInTheDocument()
    expect(screen.queryByText(/규칙이 대신 팔았습니다|직전 진입은 직접 파셨습니다/)).not.toBeInTheDocument()
  })

  it('재진입을 기다리는 전량 매도(IDLE_REENTRY)는 되돌아보기로 넘기지 않고 다시 매수 폼을 보여준다 (D35)', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'IDLE_REENTRY',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      entries: [
        {
          entrySequence: 1,
          exitPreset: 'BALANCED',
          buyOrderType: 'MARKET',
          scenarioScriptId: 'CRYPTO_STORY_V1',
          buyAt: '2026-08-20T11:00:00',
          buyPrice: 10000,
          buyQuantity: 2,
          stopLossPrice: 9700,
          takeProfitPrice: 10500,
          sellPrice: 9700,
          sellQuantity: 2,
          sellAt: '2026-08-20T11:12:00',
          sellCause: 'STOP_LOSS',
          realizedPnl: -600,
          unrealizedPnlIfHeld: null,
        },
      ],
    })
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    // 조기 완료로 이야기를 끊지 않는다 — 되돌아보기 탭은 여전히 잠겨 있다.
    expect(screen.getByRole('button', { name: '되돌아보기' })).toBeDisabled()
    // 대신 주문 탭이 **왜 정리됐는지**와 함께 다시 매수 폼을 보여준다 — 비율과 원인이 문장 안에
    // 있어야 사용자가 자기 규칙이 작동했다는 걸 안다(예전엔 "직전 진입이 정리됐습니다"뿐이었다).
    expect(screen.getByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다.')).toBeInTheDocument()
    expect(screen.getByText('1번째 진입')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
  })

  it('IDLE_REENTRY에 닿기 전(ACT1·ACT2 도중)에 손절로 일찍 전량 매도돼도 복기로 조기 완료시키지 않는다 (D44, 실사용 중 발견)', async () => {
    // scenarioStage는 매도로 옮겨가지 않는다(PracticeScenarioProgressService 주석) — 손절이
    // 대본 커서보다 먼저 발동하면 아직 ACT1·ACT2 도중에 전량 매도 상태가 될 수 있다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'ACT1',
      scenarioProgressing: true,
      causeStatus: 'NONE_KNOWN',
    })
    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), {
      ...progress(sold),
      entries: [
        {
          entrySequence: 1,
          exitPreset: 'BALANCED',
          buyOrderType: 'MARKET',
          scenarioScriptId: 'CRYPTO_STORY_V1',
          buyAt: '2026-08-20T11:00:00',
          buyPrice: 10000,
          buyQuantity: 2,
          stopLossPrice: 9700,
          takeProfitPrice: 10500,
          sellPrice: 9700,
          sellQuantity: 2,
          sellAt: '2026-08-20T11:01:00',
          sellCause: 'STOP_LOSS',
          realizedPnl: -600,
          unrealizedPnlIfHeld: null,
        },
      ],
    })
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    // ACT1이라 아직 IDLE_REENTRY가 아니지만, 대본이 안 끝났으면(FINISHED가 아니면) 여전히 재진입 대기다.
    expect(screen.getByRole('button', { name: '되돌아보기' })).toBeDisabled()
    expect(screen.getByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
    // 국면 이름이 "팔 기준을 미리 정하기"로 **되돌아간다** — 그 되돌아감 자체가 "한 번 더 한다"는
    // 신호다. 전진만 하는 로드맵에서는 이 반복이 버그처럼 보였다. 같은 이름이 상단 학습 단계
    // 목록(TutorialPhaseProgress)에도 함께 뜨므로, "지금 배우는 것" 카드로 좁혀서 확인한다.
    expect(
      within(screen.getByRole('region', { name: '지금 배우는 것' })).getByText('흔들리기 전에 팔 기준 정하기'),
    ).toBeInTheDocument()
  })

  it('대본이 FINISHED에 닿은 뒤의 전량 매도는 진짜 끝이라 되돌아보기로 넘긴다', async () => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      scenarioStage: 'FINISHED',
      scenarioProgressing: false,
      causeStatus: 'REVEALED',
    })
    const sold = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(sold))
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByRole('button', { name: '되돌아보기' })).toBeEnabled()
    expect(
      screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'),
    ).toBeInTheDocument()
  })

  it('진행감은 단계 번호가 아니라 목표 두 칸으로 말하고, 끝낸 일은 번호 없이 아래에 남는다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    const goalRail = screen.getByLabelText('오늘의 목표')
    expect(within(goalRail).getByText('시장가 매매')).toBeInTheDocument()
    expect(within(goalRail).getByText('지정가 매매')).toBeInTheDocument()
    expect(within(goalRail).getByText('손절·익절 겪기')).toBeInTheDocument()
    expect(
      within(goalRail).getByText('시장가·지정가 매매를 마치고 손절·익절을 한 번씩 겪으면 마무리할 수 있어요.'),
    ).toBeInTheDocument()

    // 번호 체계는 전부 걷어냈다 — 로드맵 4단계도, 인라인 헤딩 번호도 없다.
    expect(screen.queryByText(/4단계 중/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1\. 고르기 완료/)).not.toBeInTheDocument()
    expect(screen.getByText('고른 종목 · 연습 코인')).toBeInTheDocument()
  })

  it('완료(replay)된 attempt에서도 재시작 버튼을 눌러 확인하면 재시작 API를 정상 호출한다 (040, 이슈 #402)', async () => {
    renderFlow(
      attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk }),
      progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 0 }), 'COMPLETED', 'COMPLETED'),
    )
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 시작' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }))
    await waitFor(() => expect(restartPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('재시작이 PRACTICE_EVIDENCE_MISSING으로 실패하면 단계 진행용 기본 문구 대신 재시작 문구를 보여준다 (백엔드 #433)', async () => {
    // 기본 매핑은 "먼저 종목을 사고, 차트에서 가격을 한 번 확인해 주세요"인데, 재시작을 누른 사람에게는
    // 무엇을 하라는 말인지 알 수 없다. 프로덕션에서 실제로 이 문장이 떴다.
    vi.mocked(restartPracticeAttempt).mockRejectedValueOnce(
      new ApiError(409, 'PRACTICE_EVIDENCE_MISSING', null, null),
    )
    renderFlow(
      attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk }),
      progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 0 }), 'COMPLETED', 'COMPLETED'),
    )
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 시작' }))
    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }))

    await waitFor(() =>
      expect(screen.getByText(/지금은 이 연습을 다시 시작할 수 없습니다/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/먼저 종목을 사고/)).not.toBeInTheDocument()
  })

  it('replay 화면은 progress.rewardAmount(영속 값)로 보상 안내를 보여준다 — 새로고침해도 사라지지 않는다 (040, 이슈 #402)', async () => {
    const currentEvidence = evidence({
      holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    // handleReflection 응답을 거치지 않고 곧바로 completed 상태로 마운트한다 — 안내가 응답을 받은
    // 이번 세션에서만 유효한 임시 state가 아니라, progress에 실려 오는 영속 값에서 나온다는 걸 검증한다.
    renderFlow(
      attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk }),
      progress(currentEvidence, 'COMPLETED', 'COMPLETED'),
    )
    await flushPromises()

    // 금액이 먼저, 재지급 제한은 작게 아래로. 문구는 축하 모달과 같은 곳에서 파생돼 시장 이름이 붙는다.
    expect(screen.getByText('코인용 자금 5,000,000원이 계좌에 들어왔습니다.')).toBeInTheDocument()
    // "축하합니다"는 완료한 그 순간의 말이라 모달에만 둔다 — 다시 들어와도 보이는 이 카드에는 없다.
    expect(screen.queryByText(/축하합니다/)).not.toBeInTheDocument()
    expect(
      screen.getByText('완료 보상은 이 시장에서 최초 1회만 지급됩니다. 재시작해 다시 완료해도 보상은 추가로 지급되지 않습니다.'),
    ).toBeInTheDocument()
  })

  /** 복기 저장이 끝난 직후 상태 — 전량 매도·관찰 완료라 복기 입력이 열려 있다. */
  function reflectionReadyEvidence() {
    return evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      sellTradeId: 61,
      buyQuantity: 1,
      sellQuantity: 1,
      remainingQuantity: 0,
    })
  }

  async function saveReflection() {
    fireEvent.change(screen.getByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'), {
      target: { value: '한 줄 기록' },
    })
    fireEvent.click(screen.getByRole('button', { name: '적은 내용 저장하고 끝내기' }))
    await waitFor(() => expect(saveHoldingReflection).toHaveBeenCalled())
    await flushPromises()
  }

  it('rewardGranted가 true면 복기 저장 직후 축하 모달을 연다', async () => {
    vi.mocked(saveHoldingReflection).mockResolvedValue({
      reflectionId: 7,
      holdingId: 41,
      answer: '한 줄 기록',
      createdAt: '2026-08-14T12:10:00',
      rewardGranted: true,
    })
    // 저장 뒤 onRefresh로 갱신된 progress를 흉내 낸다 — 금액은 progress.rewardAmount에서만 읽는다.
    renderFlow(attempt({ riskSnapshot: risk }), progress(reflectionReadyEvidence(), 'COMPLETED', 'COMPLETED'))
    await flushPromises()

    // 복기 입력 자체가 이제 모달(되돌아보기, eyebrow "실습 기록")로 뜬다 — role("dialog")만으로는
    // 이 모달과 아래에서 확인할 축하 모달("실습 완료")을 구분할 수 없어 문구로 특정한다.
    expect(screen.queryByText('실습 완료')).not.toBeInTheDocument()
    await saveReflection()

    // rewardGranted가 true가 되는 순간 되돌아보기 모달은 닫히고 축하 모달만 남는다(둘이 겹치면
    // role("dialog")가 두 개가 된다) — 그래서 findByRole('dialog')로 유일하게 잡힌다.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('코인 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '실전 거래 시작하기' })).toHaveAttribute('href', '/trade')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    // 축하 모달을 닫으면 되돌아보기 모달로 돌아간다 — CompletionCelebration 자체 주석대로("닫으면
    // 되돌아보기 탭이 보이므로") 원래도 그 자리로 돌아가는 게 의도였고, 그 자리가 이제 모달이다.
    expect(screen.queryByText('실습 완료')).not.toBeInTheDocument()
    expect(screen.getByText('실습 기록')).toBeInTheDocument()

    // 백엔드 이슈 #432 — 복기 질문 문구는 서버 응답(`prompt`)이 아니라 클라이언트가 소유한다.
    // 저장된 답변 위에 그 문구가 실제로 그려지는지 고정한다(예전에는 렌더 결과를 단언하지 않아,
    // 서버가 필드를 빼면 이 자리가 조용히 빈 줄이 되는 것을 아무 테스트도 잡지 못했다).
    expect(screen.getByText('한 줄 기록')).toBeInTheDocument()
    expect(
      screen.getAllByText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.').length,
    ).toBeGreaterThan(0)
  })

  it('재완료(rewardGranted=false)에는 축하 모달을 열지 않는다', async () => {
    // 040(이슈 #402) 재완료는 새 reflection 행도 보상도 없다 — 받지 않은 돈을 축하하면 거짓말이 된다.
    vi.mocked(saveHoldingReflection).mockResolvedValue({
      reflectionId: null,
      holdingId: 41,
      answer: '한 줄 기록',
      createdAt: '2026-08-14T12:10:00',
      rewardGranted: false,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(reflectionReadyEvidence(), 'COMPLETED', 'COMPLETED'))
    await flushPromises()

    await saveReflection()

    // 되돌아보기 모달(복기 입력)은 여전히 떠 있어도 된다 — 뜨면 안 되는 건 축하 모달뿐이다.
    expect(screen.queryByText('실습 완료')).not.toBeInTheDocument()
  })

  it('이미 완료된 화면에 새로 들어오면 축하 모달이 뜨지 않는다', async () => {
    // 모달은 완료 순간의 응답으로만 열린다 — 어디에도 영속하지 않으므로 새로고침·재진입에는 뜨지 않는다.
    renderFlow(
      attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk }),
      progress(reflectionReadyEvidence(), 'COMPLETED', 'COMPLETED'),
    )
    await flushPromises()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 카드는 모달과 같은 제목을 쓰되 축하 문장 없이 기록만 보여준다.
    expect(screen.getByText('코인 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/축하합니다/)).not.toBeInTheDocument()
  })

  it('완료 화면은 되돌아가는 문 말고 실전으로 나가는 문을 1차 CTA로 준다', async () => {
    const currentEvidence = evidence({
      holdingId: 41, observationId: 51, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0,
    })
    renderFlow(
      attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk }),
      progress(currentEvidence, 'COMPLETED', 'COMPLETED'),
    )
    await flushPromises()

    expect(screen.getByRole('link', { name: '실전 거래 시작하기' })).toHaveAttribute('href', '/trade')
    expect(screen.getByText(/여기서 연습한 종목은 가상이라 포트폴리오와 랭킹에는/)).toBeInTheDocument()
    // 화면 맨 위로 스크롤해 주던 "다른 시장도 연습해 보기"는 없앴다 — 모의투자 화면과 같은 고정
    // 레이아웃이 되면서 시장 탭이 항상 화면에 떠 있어 스크롤할 곳 자체가 없다.
    expect(screen.queryByRole('button', { name: '다른 시장도 연습해 보기' })).not.toBeInTheDocument()
  })

  it.each([
    ['selection', attempt({ status: 'SELECTING_INSTRUMENT', instrumentId: null }), progress()],
    ['buy', attempt({ riskSnapshot: null }), progress()],
    ['observe', attempt({ riskSnapshot: risk }), progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 2 }))],
    ['sell', attempt({ riskSnapshot: risk }), progress(evidence({ holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2 }))],
  ])('requires confirmation before restart in the %s stage', async (_stage, currentAttempt, currentProgress) => {
    renderFlow(currentAttempt, currentProgress)
    const restart = screen.getByRole('button', { name: '처음부터 다시 시작' })

    // 브라우저 네이티브 confirm() 대신 인앱 모달을 쓴다 — 취소하면 재시작이 실행되지 않아야 한다.
    fireEvent.click(restart)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(restartPracticeAttempt).not.toHaveBeenCalled()

    fireEvent.click(restart)
    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }))
    await waitFor(() => expect(restartPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
  })

  it('shows the restart path when step 4 is expired', async () => {
    renderFlow(
      attempt({ riskSnapshot: risk }),
      progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 2 }), 'EXPIRED', 'EXPIRED'),
    )

    // 만료 문구는 실패가 아니라는 것부터 말한다.
    expect(screen.getByText(/시간이 끝나서 이번 연습은 여기까지입니다/)).toBeInTheDocument()
    const restart = screen.getByRole('button', { name: '처음부터 다시 시작' })
    // 만료 화면에는 주문 버튼이 하나도 남지 않아야 한다 — 새 문구(구매하기·판매하기) 기준으로 확인한다.
    expect(screen.queryByRole('button', { name: /구매하기|판매하기/ })).not.toBeInTheDocument()

    fireEvent.click(restart)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(restartPracticeAttempt).not.toHaveBeenCalled()

    fireEvent.click(restart)
    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }))
    await waitFor(() => expect(restartPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
    await flushPromises()
  })

  it('renders completed replay read-only and never ticks or exposes mutations', async () => {
    vi.useFakeTimers()
    const replayAttempt = attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk })
    renderFlow(replayAttempt, progress(
      evidence({ holdingId: 41, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0 }),
      'COMPLETED',
      'COMPLETED',
    ))
    await flushPromises()
    await act(async () => vi.advanceTimersByTime(30_000))

    expect(screen.getByText('코인 시장의 실습을 완료했습니다')).toBeInTheDocument()
    // 040(이슈 #402)부터 완료(replay)에서도 재시작 버튼을 계속 노출한다 — 클릭·확인 전까지는 아무 것도
    // 자동으로 실행되지 않는다는 이 테스트의 취지(아래 not.toHaveBeenCalled 목록)는 그대로 유지된다.
    expect(screen.getByRole('button', { name: '처음부터 다시 시작' })).toBeInTheDocument()
    expect(tickPracticeAttempt).not.toHaveBeenCalled()
    expect(placeOrder).not.toHaveBeenCalled()
    expect(placeLimitOrder).not.toHaveBeenCalled()
    expect(recordHoldingObservation).not.toHaveBeenCalled()
    expect(saveHoldingReflection).not.toHaveBeenCalled()
    expect(restartPracticeAttempt).not.toHaveBeenCalled()
  })

  it('구매 단계는 구어체 대신 구매하기를 쓰고 전문용어를 한 곳에만 병기한다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())

    // 헤딩에서 번호를 뗐다 — "지금 배우는 것"이 국면 이름을 대신 말한다.
    expect(screen.getByRole('heading', { name: '구매' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
    expect(screen.getByText('주문 금액')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사기|팔기/ })).not.toBeInTheDocument()
  })

  it('판매 단계도 같은 규칙으로 판매하기를 쓰고 (매도)를 한 곳에만 병기한다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByRole('heading', { name: '판매' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사기|팔기/ })).not.toBeInTheDocument()
  })

  it('주문 카드 안에서 지금 값을 보여주고 값이 바뀌면 잠깐 색으로 알린다', async () => {
    // 지금까지는 주문 카드에 "1개 × 10,567원"만 있어서 그게 지금 값인지 보려면 차트까지 올라가야 했다.
    vi.useFakeTimers()
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()

    const priceBox = screen.getByText('지금 값').parentElement as HTMLElement
    expect(within(priceBox).getByText('123원')).toBeInTheDocument()

    vi.mocked(tickPracticeAttempt).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 100, high: 130, low: 90, close: 130, current: true }],
    })
    await act(async () => vi.advanceTimersByTime(3000))
    await flushPromises()

    expect(within(priceBox).getByText('130원')).toHaveClass('text-gain')
    await act(async () => vi.advanceTimersByTime(800))
    expect(within(priceBox).getByText('130원')).toHaveClass('text-ink')
    vi.useRealTimers()
  })

  it('현재가 버튼은 소수점을 정리한 값을 넣고, 올리기·내리기가 가격대에 맞는 폭으로 움직인다', async () => {
    // 코인이 소수점 주문을 지원한다고 해서 사용자가 9,699.786원에 걸겠다는 뜻은 아니다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 9000, high: 9900, low: 8900, close: 9699.786, current: true }],
    })
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '지정가' }))
    fireEvent.click(screen.getByRole('button', { name: '현재가' }))
    expect(screen.getByLabelText('지정가')).toHaveValue('9700')

    // 9,700원의 0.5%는 48.5 → 50원 격자. 고정 1,000원이면 한 번에 10%가 움직여 손절선(-3%)을 넘긴다.
    fireEvent.click(screen.getByRole('button', { name: '지정가 올리기' }))
    expect(screen.getByLabelText('지정가')).toHaveValue('9750')
    fireEvent.click(screen.getByRole('button', { name: '지정가 내리기' }))
    expect(screen.getByLabelText('지정가')).toHaveValue('9700')
    expect(screen.getByText(/지금 값과 거의 같습니다/)).toBeInTheDocument()
  })

  it('지정가 내리기를 계속 눌러도 0 이하로는 내려가지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '지정가' }))
    fireEvent.click(screen.getByRole('button', { name: '현재가' }))
    const down = screen.getByRole('button', { name: '지정가 내리기' })
    for (let i = 0; i < 40; i += 1) fireEvent.click(down)

    const input = screen.getByLabelText('지정가') as HTMLInputElement
    expect(Number(input.value)).toBeGreaterThan(0)
  })

  it('미체결 카드의 정정은 취소 후 재주문이 아니라 amendLimitOrder를 부른다', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    vi.mocked(amendLimitOrder).mockResolvedValue({
      orderId: 83,
      market: 'CRYPTO',
      instrumentId: 701,
      side: 'BUY',
      orderType: 'LIMIT',
      status: 'PENDING',
      quantity: 2,
      limitPrice: 130,
      requestedAt: '2026-08-14T12:00:00',
    })
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '걸어 둔 값 고치기' }))
    fireEvent.change(screen.getByLabelText('바꿀 지정가'), { target: { value: '130' } })
    fireEvent.change(screen.getByLabelText('바꿀 개수'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '이 값으로 고치기' }))

    await waitFor(() =>
      expect(amendLimitOrder).toHaveBeenCalledWith(83, { limitPrice: '130', quantity: '2' }),
    )
    // 취소 후 재주문이면 예약이 잠깐 사라지고 주문 순서도 바뀐다 — 정정 API는 그러지 않는다.
    expect(cancelLimitOrder).not.toHaveBeenCalled()
    expect(placeLimitOrder).not.toHaveBeenCalled()
    expect(await screen.findByText('130원')).toBeInTheDocument()
  })

  it('미체결 카드의 취소는 그대로 동작하고 취소됐다는 사실을 남긴다', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))

    expect(await screen.findByText('지정가 주문을 취소했습니다. 체결되지 않았습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '걸어 둔 값 고치기' })).not.toBeInTheDocument()
    expect(amendLimitOrder).not.toHaveBeenCalled()
  })

  it('취소하려는 사이에 이미 체결돼 409가 와도 카드에 갇히지 않고 체결로 결말을 바꾼다 (실사용 중 발견)', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    vi.mocked(cancelLimitOrder).mockRejectedValue(new ApiError(409, 'ORDER_ALREADY_FILLED', null, null))
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))

    // "요청을 처리할 수 없습니다" 같은 일반 오류로 카드가 멈추지 않는다 — 체결 결말로 바뀐다.
    expect(await screen.findByText(/걸어 둔 값에 체결됐습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지정가 주문 취소' })).not.toBeInTheDocument()
    expect(screen.queryByText('요청을 처리할 수 없습니다.')).not.toBeInTheDocument()
  })

  it('고치려는 사이에 이미 취소돼 409가 와도 카드에 갇히지 않고 취소로 결말을 바꾼다 (실사용 중 발견)', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    vi.mocked(amendLimitOrder).mockRejectedValue(new ApiError(409, 'ORDER_ALREADY_CANCELLED', null, null))
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '걸어 둔 값 고치기' }))
    fireEvent.change(screen.getByLabelText('바꿀 지정가'), { target: { value: '130' } })
    fireEvent.change(screen.getByLabelText('바꿀 개수'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '이 값으로 고치기' }))

    await waitFor(() => expect(amendLimitOrder).toHaveBeenCalled())
    expect(await screen.findByText('지정가 주문을 취소했습니다. 체결되지 않았습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '걸어 둔 값 고치기' })).not.toBeInTheDocument()
  })

  it('"지금 값에 바로 체결"을 눌렀는데 그 사이 이미 체결됐으면 중복 주문 없이 체결 결말만 알린다 (실사용 중 발견)', async () => {
    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83, side: 'BUY' })])
    vi.mocked(cancelLimitOrder).mockRejectedValue(new ApiError(409, 'ORDER_ALREADY_FILLED', null, null))
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: '기다리지 않고 지금 값에 구매하기' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))

    // 이미 산 걸 또 사면 안 된다 — 새 시장가 주문을 넣지 않는다.
    expect(placeOrder).not.toHaveBeenCalled()
    expect(await screen.findByText(/걸어 둔 값에 체결됐습니다/)).toBeInTheDocument()
    expect(screen.queryByText('요청을 처리할 수 없습니다.')).not.toBeInTheDocument()
  })

  it('tick마다 튜토리얼 주문 조회로 예약 상태를 확인해 체결되면 카드를 결말로 바꾼다', async () => {
    // 체결 알림이 없어 폴링이 유일한 감지 수단이다 — 카드를 조용히 지우면 팔렸는지 알 수 없다.
    // 435: 이 엔드포인트는 상태 무관 전부 오므로, 첫 호출(마운트 복원)은 PENDING을, 이후 tick
    // 호출은 FILLED를 돌려주는 것만으로 한 번의 조회로 결말을 확정할 수 있다.
    vi.useFakeTimers()
    vi.mocked(getPracticeAttemptOrders)
      .mockResolvedValueOnce([practiceOrder({ orderId: 83 })])
      .mockResolvedValue([practiceOrder({ orderId: 83, status: 'FILLED' })])
    renderFlow()
    await flushPromises()
    await flushPromises()
    expect(screen.getByText(/정한 값이 되기를 기다리는 중입니다/)).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(3000))
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(screen.queryByText(/정한 값이 되기를 기다리는 중입니다/)).not.toBeInTheDocument()
    expect(screen.getByText('걸어 둔 값에 체결됐습니다. 1개를 123원에 구매했습니다.')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('사라진 예약을 목록에서 찾지 못하면 체결됐다고 지어내지 않는다', async () => {
    // 이 목록은 현재 attempt·run 귀속 주문만 오므로 정상적으로는 일어나지 않아야 하는 방어적 케이스다.
    vi.useFakeTimers()
    vi.mocked(getPracticeAttemptOrders)
      .mockResolvedValueOnce([practiceOrder({ orderId: 83 })])
      .mockResolvedValue([])
    renderFlow()
    await flushPromises()
    await flushPromises()

    await act(async () => vi.advanceTimersByTime(3000))
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(
      screen.getByText('지정가 주문이 대기 목록에서 사라졌습니다. 체결됐는지 취소됐는지는 확인하지 못했습니다.'),
    ).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('주문 조회가 실패해도 예약 카드를 함부로 지우지 않고 다음 주기에 다시 확인한다', async () => {
    // 네트워크 오류 한 번으로 체결·취소를 지어내면 안 된다 — 카드는 그대로 두고 다음 tick에 재시도한다.
    vi.useFakeTimers()
    vi.mocked(getPracticeAttemptOrders)
      .mockResolvedValueOnce([practiceOrder({ orderId: 83 })])
      .mockRejectedValueOnce(new Error('network'))
    renderFlow()
    await flushPromises()
    await flushPromises()
    expect(screen.getByText(/정한 값이 되기를 기다리는 중입니다/)).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(3000))
    await flushPromises()
    await flushPromises()

    expect(screen.getByText(/정한 값이 되기를 기다리는 중입니다/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('안내 단계는 대상이 있을 수 있는 것만 담는다 — 주식엔 지정가, 예약 없으면 미체결을 뺀다', async () => {
    // SpotlightTour는 대상 없는 단계를 건너뛰지만 1초를 기다린다. 오지 않을 대상을 기다리게 두지 않는다.
    const stock = renderFlow(
      attempt({ market: 'STOCK', instrumentId: 801, riskSnapshot: null }),
      { ...progress(), tutorialKey: 'INVESTMENT_PRACTICE_V1' },
    )
    await flushPromises()
    expect(tourSpy.targets).toEqual(['instrument', 'quantity', 'buy', 'chart', 'sell', 'reflection'])
    stock.unmount()

    const crypto = renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()
    expect(tourSpy.targets).toEqual([
      'instrument', 'order-type', 'quantity', 'buy', 'chart', 'sell', 'reflection',
    ])
    crypto.unmount()

    vi.mocked(getPracticeAttemptOrders).mockResolvedValue([practiceOrder({ orderId: 83 })])
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(tourSpy.targets).toContain('pending'))
    expect(tourSpy.targets).toEqual([
      'instrument', 'order-type', 'quantity', 'buy', 'chart', 'pending', 'sell', 'reflection',
    ])
  })

  it('판매를 예약하면 확인 카드가 4단계 판매 카드 안에 뜨고 잠긴 이유도 그 자리에서 알린다', async () => {
    // 위치가 요점이다. 예전에는 차트보다도 위(판매 카드 바깥)에 떠서, 4단계에서 예약을 걸면
    // 방금 누른 자리에서는 버튼이 조용히 잠기기만 하고 아무 변화도 보이지 않았다.
    const currentEvidence = evidence({
      buyTradeId: 31,
      holdingId: 41,
      observationId: 51,
      buyQuantity: 2,
      remainingQuantity: 2,
    })
    vi.mocked(placeLimitOrder).mockResolvedValue({
      orderId: 91,
      market: 'CRYPTO',
      instrumentId: 701,
      side: 'SELL',
      orderType: 'LIMIT',
      status: 'PENDING',
      quantity: 2,
      limitPrice: 130,
      requestedAt: '2026-08-14T12:00:00',
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: '지정가' }))
    fireEvent.click(screen.getByRole('button', { name: '현재가' }))
    fireEvent.click(screen.getByRole('button', { name: '가진 2개 정한 값에 판매하기' }))

    const pendingCard = await screen.findByText(/정한 값이 되기를 기다리는 중입니다/)
    const sellCard = screen.getByRole('heading', { name: '판매' }).closest('.bezel-core')
    expect(sellCard).not.toBeNull()
    expect(sellCard).toContainElement(pendingCard)
    // 두 곳에 동시에 나오면 사용자는 예약을 두 개 건 줄 안다.
    expect(screen.getAllByText(/정한 값이 되기를 기다리는 중입니다/)).toHaveLength(1)

    expect(screen.getByRole('button', { name: '가진 2개 정한 값에 판매하기' })).toBeDisabled()
    expect(sellCard).toContainElement(
      screen.getByText(/바로 아래 지정가 주문이 기다리는 중이라 지금은 새로 주문할 수 없어요/),
    )
  })

  describe('학습 국면·목표 두 칸·자동 매도 모달 (2026-08-21 재설계)', () => {
    /** 진행 조회만 갈아끼워 다시 그린다 — tick 한 번이 지나간 것과 같은 효과다. */
    function rerenderWith(
      view: ReturnType<typeof renderFlow>,
      currentProgress: InvestmentPracticeResponse,
      currentAttempt = attempt({ riskSnapshot: risk }),
    ) {
      view.rerender(
        <MemoryRouter>
          <AttemptTutorialFlow
            market="CRYPTO"
            attempt={currentAttempt}
            progress={currentProgress}
            onAttemptChange={vi.fn()}
            onRefresh={vi.fn().mockResolvedValue(undefined)}
          />
        </MemoryRouter>,
      )
    }

    /** 전량 매도된 뒤의 evidence — 진입은 끝났고 보유는 0이다. */
    function soldEvidence() {
      return evidence({
        buyTradeId: 31,
        holdingId: 41,
        observationId: 51,
        buyQuantity: 2,
        remainingQuantity: 0,
      })
    }

    /**
     * 이 describe 블록의 시나리오(보유 중·예약·자동 매도)는 전부 ORDER_BASICS를 이미 벗어난
     * 뒤의 국면이다 — 시장가·지정가를 마치지 않으면 그 국면 자체에 들어올 수 없다. 그래서 이
     * 두 목표는 여기서는 늘 완료로 둔다(2026-08-24 — 오늘의 목표에 시장가·지정가가 추가됐다).
     */
    const stageBasicsDone = {
      marketBuySellCompleted: true,
      limitBuySellCompleted: true,
      exitPresetSelected: true,
    }

    it('A 국면 — 종목을 고르기 전에는 왼쪽에서 고르라고만 말한다', async () => {
      renderFlow(
        attempt({ status: 'SELECTING_INSTRUMENT', instrumentId: null, riskSnapshot: null }),
        progress(),
      )
      await flushPromises()

      const phaseCard = screen.getByLabelText('지금 배우는 것')
      expect(within(phaseCard).getByText('연습할 종목 고르기')).toBeInTheDocument()
      expect(within(phaseCard).getByText('왼쪽에서 하나 고르세요')).toBeInTheDocument()
    })

    it('B 국면 — 2단계 대본에서는 주문 넣는 법과 두 칩만 말한다', async () => {
      vi.mocked(getPracticeAttemptChart).mockResolvedValue({
        ...chart,
        scenarioStage: 'ORDER_BASICS',
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN',
      })
      renderFlow(attempt({ riskSnapshot: null }), progress())
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      const phaseCard = screen.getByLabelText('지금 배우는 것')
      expect(within(phaseCard).getByText('주문 넣는 법 익히기')).toBeInTheDocument()
      expect(
        within(phaseCard).getByText('시장가로 한 번 사고팔기 → 지정가로 한 번 사고팔기'),
      ).toBeInTheDocument()
      expect(within(phaseCard).getByText('시장가 매매')).toBeInTheDocument()
    })

    it('C 국면 — 보유 중인데 예약이 없으면 팔 기준을 정하라고 말한다', async () => {
      renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
      await flushPromises()

      const phaseCard = screen.getByLabelText('지금 배우는 것')
      expect(within(phaseCard).getByText('흔들리기 전에 팔 기준 정하기')).toBeInTheDocument()
      expect(
        within(phaseCard).getByText('얼마나 내려가면 팔지, 올라가면 팔지 지금 정하세요'),
      ).toBeInTheDocument()
      // 시장가·지정가를 마친 뒤에도 손절·익절 단계를 지금 당장 끝내지 않아도 된다는 것과, 그래도
      // 완료·보상에는 결국 필요하다는 것을 함께 말한다(2026-08-24 피드백).
      expect(within(phaseCard).getByText(/지금 끝내지 않아도 괜찮아요/)).toBeInTheDocument()
      expect(within(phaseCard).getByText(/손절과 익절을 한 번씩은 실제로 겪어야/)).toBeInTheDocument()
    })

    it('국면 — 주식은 손절·익절 개념이 없어 "지금 끝내지 않아도" 안내를 보여주지 않는다', async () => {
      renderFlow(attempt({ market: 'STOCK', riskSnapshot: risk }), progress(holdingEvidence()))
      await flushPromises()

      const phaseCard = screen.getByLabelText('지금 배우는 것')
      expect(within(phaseCard).getByText('팔아보기')).toBeInTheDocument()
      expect(within(phaseCard).queryByText(/지금 끝내지 않아도 괜찮아요/)).not.toBeInTheDocument()
    })

    it('D 국면 — 예약을 걸면 지켜보는 자리로 이름이 바뀐다', async () => {
      renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(holdingEvidence()),
        pendingExitPlan: exitPlan,
      })
      await flushPromises()

      const phaseCard = screen.getByLabelText('지금 배우는 것')
      expect(within(phaseCard).getByText('규칙이 대신 파는 것 지켜보기')).toBeInTheDocument()
      expect(within(phaseCard).getByText('선에 닿을 때까지 기다립니다')).toBeInTheDocument()
      // PLAN뿐 아니라 WATCH(예약을 걸고 지켜보는 중)에도 같은 안내가 남아 있어야 한다 — 이
      // 국면에서도 굳이 지금 지켜보지 않고 나중에 와도 된다는 사실은 똑같다.
      expect(within(phaseCard).getByText(/지금 끝내지 않아도 괜찮아요/)).toBeInTheDocument()
    })

    it('E 국면 — 목표 두 칸을 채우면 되돌아보기 탭이 실제로 열리고 마무리 버튼이 생긴다', async () => {
      // 예전에는 화면 세 곳이 "되돌아보기로 마무리해도 괜찮습니다"라고 안내하는데 그 시점이
      // 재진입 대기라 탭이 잠겨 있었다 — 안내받은 곳을 눌렀는데 반응이 없었다.
      vi.mocked(getPracticeAttemptChart).mockResolvedValue({
        ...chart,
        scenarioStage: 'ACT1',
        scenarioProgressing: true,
        causeStatus: 'NONE_KNOWN',
      })
      renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(soldEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        entries: [
          entry({ entrySequence: 1, sellCause: 'STOP_LOSS' }),
          entry({ entrySequence: 2, sellCause: 'TAKE_PROFIT', realizedPnl: 1000 }),
        ],
      })
      await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
      await flushPromises()

      const goalRail = screen.getByLabelText('오늘의 목표')
      expect(within(goalRail).getByText('✓ 손절·익절 겪기')).toBeInTheDocument()

      expect(screen.getByRole('button', { name: '되돌아보기' })).toBeEnabled()
      expect(screen.getByText("아래 '지금 마무리하기'를 누르면 끝납니다.")).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '지금 마무리하기' }))
      expect(
        await screen.findByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'),
      ).toBeInTheDocument()
    })

    it('목표는 겪은 것만 센다 — 예약을 걸어 둔 것만으로는 채워지지 않는다', async () => {
      const view = renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(holdingEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        pendingExitPlan: exitPlan,
      })
      await flushPromises()

      expect(within(screen.getByLabelText('오늘의 목표')).getByText('손절·익절 겪기')).toBeInTheDocument()
      expect(
        within(screen.getByLabelText('오늘의 목표')).queryByText('✓ 손절·익절 겪기'),
      ).not.toBeInTheDocument()

      rerenderWith(view, {
        ...progress(soldEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        entries: [entry({ sellCause: 'STOP_LOSS' })],
      })

      // 손절만 겪었을 뿐 익절은 아직이라 손절·익절 겪기 칸은 여전히 안 채워진다.
      const goalRail = screen.getByLabelText('오늘의 목표')
      expect(within(goalRail).getByText('손절·익절 겪기')).toBeInTheDocument()
      expect(within(goalRail).queryByText('✓ 손절·익절 겪기')).not.toBeInTheDocument()
    })

    it('손절로 자동 정리되는 순간 두 숫자를 나란히 보여주고 규칙이 지켜 준 금액을 말한다', async () => {
      const view = renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(holdingEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        pendingExitPlan: exitPlan,
      })
      await flushPromises()
      expect(screen.queryByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다')).not.toBeInTheDocument()

      // 사용자가 누른 적이 없는 사건이다 — tick이 entries에 새 sellCause를 만든 순간에만 잡힌다.
      rerenderWith(view, {
        ...progress(soldEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        entries: [entry({ sellCause: 'STOP_LOSS', realizedPnl: -600, unrealizedPnlIfHeld: -2000 })],
      })

      expect(await screen.findByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다')).toBeInTheDocument()
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('내 결과')).toBeInTheDocument()
      expect(within(dialog).getByText('규칙이 없었다면')).toBeInTheDocument()
      expect(within(dialog).getByText('-600원')).toBeInTheDocument()
      expect(within(dialog).getByText('-2,000원')).toBeInTheDocument()
      expect(within(dialog).getByText('당신이 판단하지 않는 사이 1,400원을 지켜줬습니다.')).toBeInTheDocument()
      expect(within(dialog).getByText('하나 남았습니다.')).toBeInTheDocument()

      // 뺀 것들 — 이 순간에 필요 없는 정보로 숫자 두 개를 가리지 않는다.
      expect(within(dialog).queryByText(/수수료/)).not.toBeInTheDocument()
      expect(within(dialog).queryByText('실전 거래 시작하기')).not.toBeInTheDocument()
      expect(within(dialog).queryByText(/1번째 진입/)).not.toBeInTheDocument()
    })

    it('익절에서는 반사실을 그 순간에 보여주지 않는다 — 대본상 더 오르는 구간이라 교훈이 뒤집힌다', async () => {
      const view = renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(holdingEvidence()),
        pendingExitPlan: exitPlan,
      })
      await flushPromises()

      rerenderWith(view, {
        ...progress(soldEvidence()),
        entries: [entry({ sellCause: 'TAKE_PROFIT', realizedPnl: 1000, unrealizedPnlIfHeld: 3000 })],
      })

      expect(await screen.findByText('정해 둔 +5% 선에 닿아 규칙이 대신 팔았습니다')).toBeInTheDocument()
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('내 결과')).toBeInTheDocument()
      expect(within(dialog).getByText('+1,000원')).toBeInTheDocument()
      // 숨기는 게 아니라 의미를 갖는 시점(대본 후반·완료 화면)으로 미루는 것이다.
      expect(within(dialog).queryByText('규칙이 없었다면')).not.toBeInTheDocument()
      expect(within(dialog).queryByText('+3,000원')).not.toBeInTheDocument()
      expect(within(dialog).getByText('그 순간 당신은 판단하지 않았습니다.')).toBeInTheDocument()
    })

    it('새로고침으로 들어와 지난 손절 기록이 이미 있으면 모달을 다시 띄우지 않는다', async () => {
      renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(soldEvidence()),
        entries: [entry({ sellCause: 'STOP_LOSS' })],
      })
      await flushPromises()

      expect(screen.queryByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다')).not.toBeInTheDocument()
    })

    it('사용자가 직접 판 매도(MANUAL)는 자동 매도 모달을 띄우지 않는다', async () => {
      const view = renderFlow(attempt({ riskSnapshot: risk }), progress(holdingEvidence()))
      await flushPromises()

      rerenderWith(view, {
        ...progress(soldEvidence()),
        entries: [entry({ sellCause: 'MANUAL' })],
      })

      expect(screen.queryByText('정해 둔 −3% 선에 닿아 규칙이 대신 팔았습니다')).not.toBeInTheDocument()
      expect(screen.queryByText('정해 둔 +5% 선에 닿아 규칙이 대신 팔았습니다')).not.toBeInTheDocument()
    })

    it('둘 다 겪은 뒤의 자동 매도 모달은 "되돌아보기 쓰기"로 마무리로 데려간다', async () => {
      const view = renderFlow(attempt({ riskSnapshot: risk }), {
        ...progress(holdingEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        pendingExitPlan: exitPlan,
        entries: [entry({ entrySequence: 1, sellCause: 'STOP_LOSS' })],
      })
      await flushPromises()

      rerenderWith(view, {
        ...progress(soldEvidence(), 'IN_PROGRESS', 'IN_PROGRESS', false, stageBasicsDone),
        entries: [
          entry({ entrySequence: 1, sellCause: 'STOP_LOSS' }),
          entry({ entrySequence: 2, sellCause: 'TAKE_PROFIT', realizedPnl: 1000 }),
        ],
      })

      expect(await screen.findByText('정해 둔 +5% 선에 닿아 규칙이 대신 팔았습니다')).toBeInTheDocument()
      // 목표가 셋(시장가·지정가·손절익절)으로 늘어 "둘 다"가 아니라 "셋 다"다(2026-08-24).
      expect(screen.getByText('셋 다 채웠습니다.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '되돌아보기 쓰기' }))

      expect(
        await screen.findByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'),
      ).toBeInTheDocument()
    })
  })

  it('"안내 다시 보기"는 본 기록을 지우고 안내를 처음부터 다시 마운트한다', async () => {
    // localStorage 에 한 번 기록되면 영구히 다시 뜨지 않아, 다시 볼 방법이 아예 없었다.
    localStorage.setItem('finplay.tour.tutorial.CRYPTO', 'done')
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()
    const mountsBefore = tourSpy.mounts

    fireEvent.click(screen.getByRole('button', { name: '안내 다시 보기' }))
    await flushPromises()

    expect(localStorage.getItem('finplay.tour.tutorial.CRYPTO')).toBeNull()
    expect(tourSpy.mounts).toBe(mountsBefore + 1)
    localStorage.clear()
  })

  it('완료 기록 화면에는 "안내 다시 보기"를 두지 않는다', async () => {
    renderFlow(
      attempt({ status: 'COMPLETED', riskSnapshot: risk, completedAt: '2026-08-14T12:10:00' }),
      progress(evidence({ holdingId: 41, observationId: 51 }), 'COMPLETED'),
    )
    await flushPromises()

    // 안내가 가리킬 대상이 하나도 없다 — 눌러도 아무 일이 없는 버튼은 두지 않는다.
    expect(screen.queryByRole('button', { name: '안내 다시 보기' })).not.toBeInTheDocument()
  })

  it('시장가·지정가 설명은 눌러야 열리고 Escape 로 닫힌다 — 튜토리얼에서 자동으로 뜨지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()

    // 스포트라이트 안내와 겹치면 화면 두 개가 동시에 덮인다 — 자동 1회 노출은 모의투자 화면이 맡는다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '시장가·지정가가 뭔가요?' }))
    const dialog = screen.getByRole('dialog', { name: '시장가와 지정가, 뭐가 다른가요?' })
    expect(within(dialog).getByText(/지정가는 코인에서만 쓸 수 있습니다/)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('주식 튜토리얼에도 시장가·지정가 설명 버튼을 둔다', async () => {
    // 지정가 토글은 코인 전용이라 주식 화면에 없다. 설명까지 없으면 주식만 해 본 사용자는
    // 이 개념을 실전 화면에서 처음 마주하게 된다.
    renderFlow(
      attempt({ market: 'STOCK', instrumentId: 801, riskSnapshot: null }),
      { ...progress(), tutorialKey: 'INVESTMENT_PRACTICE_V1' },
    )
    await flushPromises()

    expect(screen.queryByRole('button', { name: '지정가' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '시장가·지정가가 뭔가요?' })).toBeInTheDocument()
  })
})
