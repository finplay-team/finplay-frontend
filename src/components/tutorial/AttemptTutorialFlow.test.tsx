// 영속 attempt 튜토리얼의 단일 차트 폴링·재시작·주문·replay 상태를 DOM에서 검증한다.
import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeOrderResponse,
  PracticeOverallStatus,
  PracticeTutorialChartResponse,
} from '../../services/tutorialTypes'
import {
  getPracticeAttemptChart,
  getPracticeAttemptOrders,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectExitPreset,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import { amendLimitOrder, cancelLimitOrder, placeLimitOrder, placeOrder } from '../../services/orderService'
import { AttemptTutorialFlow } from './AttemptTutorialFlow'

vi.mock('../CandleChart', () => ({
  CandleChart: ({ candles }: { candles: unknown[] }) => <div data-testid="practice-chart">{candles.length}</div>,
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
  getPracticeAttemptChart: vi.fn(),
  getPracticeAttemptOrders: vi.fn(),
  recordHoldingObservation: vi.fn(),
  restartPracticeAttempt: vi.fn(),
  saveHoldingReflection: vi.fn(),
  selectExitPreset: vi.fn(),
  selectPracticeInstrument: vi.fn(),
  tickPracticeAttempt: vi.fn(),
}))

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

/** 실제 서버 열거형(ExitPreset)과 같은 세 값 — 프리셋 픽커가 그릴 목록. */
const exitPresetOptions = [
  { preset: 'CAUTIOUS' as const, stopLossRate: 2, takeProfitRate: 3 },
  { preset: 'BALANCED' as const, stopLossRate: 3, takeProfitRate: 5 },
  { preset: 'RELAXED' as const, stopLossRate: 5, takeProfitRate: 8 },
]

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
    selectedExitPreset: 'BALANCED',
    exitPresetLocked: false,
    availableExitPresets: exitPresetOptions,
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
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))

    expect(screen.getByText('9,700원')).toBeInTheDocument()
    expect(screen.getByText('10,500원')).toBeInTheDocument()
    // 복기 입력은 전량 매도 뒤에만 열린다. placeholder에 숨겼던 질문을 고정 라벨로 올렸다.
    expect(screen.queryByLabelText('오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가진 1.25개 전부 판매하기' }))

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

  it('매수 전에는 지금 값 기준으로 손절선·익절선에서 얼마를 잃고 버는지 어림해 보여준다', async () => {
    // 매수 전에는 체결가가 없어 riskSnapshot도 없다 — 차트 최신가 × 0.97 / × 1.05 로 어림한 값이라
    // "지금 값이면"·"약"으로 확정값이 아님을 드러내야 한다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 12000, high: 12500, low: 11800, close: 12340, current: true }],
    })
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    // 코인은 금액으로 산다 — 금액을 적기 전에는 채울 수량이 없어 이 줄 자체가 없다.
    fireEvent.change(screen.getByLabelText(/얼마어치 구매할까요/), { target: { value: '123400' } })

    // 두 기준선 값은 수량과 무관하다 — 금액을 얼마로 적든 이 숫자여야 한다.
    expect(screen.getByText(/지금 값이면 손절선은 약 11,970원이고/)).toBeInTheDocument()
    expect(screen.getByText(/익절선은 약 12,957원이고/)).toBeInTheDocument()
    // 잃고 버는 금액은 환산된 수량에 비례한다 — 금액이 붙어 나오는지만 확인한다.
    expect(screen.getByText(/여기까지 떨어지면 약 [\d,]+원을 잃습니다/)).toBeInTheDocument()
    expect(screen.getByText(/여기까지 오르면 약 [\d,]+원을 법니다/)).toBeInTheDocument()
    // 서버 실현손익은 수수료가 반영된 순손익이라 나중에 숫자가 어긋나 보이면 안 된다.
    expect(screen.getByText(/수수료는 빼고 계산한 값입니다/)).toBeInTheDocument()
  })

  it('금액이 비면 손익 어림 줄을 렌더하지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    const amountField = screen.getByLabelText(/얼마어치 구매할까요/)
    fireEvent.change(amountField, { target: { value: '123400' } })
    expect(screen.getByText(/지금 값이면 손절선은/)).toBeInTheDocument()
    fireEvent.change(amountField, { target: { value: '' } })
    expect(screen.queryByText(/지금 값이면 손절선은/)).not.toBeInTheDocument()
  })

  it('매수 전 어림값은 고정 -3%/+5%가 아니라 지금 고른 프리셋을 따른다', async () => {
    // RELAXED(-5%·+8%)를 골라 둔 상태다 — BALANCED 기본값과 다른 숫자가 나와야 프리셋이 실제로
    // 반영된 것을 확인할 수 있다.
    vi.mocked(getPracticeAttemptChart).mockResolvedValue({
      ...chart,
      candles: [{ date: '2026-08-14', open: 12000, high: 12500, low: 11800, close: 12340, current: true }],
    })
    renderFlow(
      attempt({ riskSnapshot: null, selectedExitPreset: 'RELAXED' }),
      progress(),
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.change(screen.getByLabelText(/얼마어치 구매할까요/), { target: { value: '123400' } })

    // 12,340 × 0.95 = 11,723 / 12,340 × 1.08 = 13,327.2 → 반올림 13,327.
    expect(screen.getByText(/지금 값이면 손절선은 약 11,723원이고/)).toBeInTheDocument()
    expect(screen.getByText(/익절선은 약 13,327원이고/)).toBeInTheDocument()
  })

  it('프리셋 세 개를 각자의 비율과 함께 보여준다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    expect(screen.getByRole('button', { name: /조심스럽게.*-2%.*\+3%/s })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /보통.*-3%.*\+5%/s })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /느긋하게.*-5%.*\+8%/s })).toBeInTheDocument()
    // 기본 프리셋(BALANCED)이 눌린 상태로 시작한다.
    expect(screen.getByRole('button', { name: /보통.*-3%.*\+5%/s })).toHaveAttribute('aria-pressed', 'true')
  })

  it('다른 프리셋을 고르면 선택 API를 부르고 응답으로 attempt를 갱신한다', async () => {
    const onAttemptChange = vi.fn()
    const updated = attempt({ riskSnapshot: null, selectedExitPreset: 'CAUTIOUS' })
    vi.mocked(selectExitPreset).mockResolvedValue(updated)
    renderFlow(attempt({ riskSnapshot: null }), progress(), undefined, onAttemptChange)
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: /조심스럽게.*-2%.*\+3%/s }))

    await waitFor(() => expect(selectExitPreset).toHaveBeenCalledWith('CRYPTO', 'CAUTIOUS'))
    await waitFor(() => expect(onAttemptChange).toHaveBeenCalledWith(updated))
  })

  it('지금 고른 프리셋을 다시 누르면 API를 부르지 않는다', async () => {
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: /보통.*-3%.*\+5%/s }))

    expect(selectExitPreset).not.toHaveBeenCalled()
  })

  it('프리셋 선택이 실패하면 그 자리에 오류를 보여준다', async () => {
    vi.mocked(selectExitPreset).mockRejectedValue(new ApiError(409, 'PRACTICE_STEP_LOCKED', null, null))
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalled())
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: /조심스럽게.*-2%.*\+3%/s }))

    expect(await screen.findByText(/먼저 이전 단계를 완료해야 합니다/)).toBeInTheDocument()
  })

  it('매수 후에는 서버 확정 기준선으로 실제 보유 수량만큼의 손익 금액을 보여준다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    // entry 10,000 / stop 9,700 / take 10,500 · 2개 → 600원 손실, 1,000원 이익.
    expect(
      screen.getByText(/지금 2개를 갖고 있으니, 손절선에 닿으면 약 600원을 잃고 익절선에 닿으면 약 1,000원을 법니다/),
    ).toBeInTheDocument()
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
    expect(screen.getByText('2. 구매 완료 · 10,000원에 샀습니다')).toBeInTheDocument()

    const sell = screen.getByRole('button', { name: '가진 만큼 전부 판매하기' })
    expect(sell).toBeDisabled()
    // 수량을 모르는 게 진짜 이유다 — "잠시 뒤 팔 수 있어요"는 오지 않을 일을 약속하는 문구라 띄우지 않는다.
    expect(screen.queryByText('가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.')).not.toBeInTheDocument()
    expect(screen.getByText(/지금 가진 수량을 불러오지 못했습니다/)).toBeInTheDocument()
    // 위험 기준 카드의 금액 문장도 수량을 모르면 통째로 생략한다.
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

    expect(screen.getByText('3. 가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.')).toBeInTheDocument()
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

    expect(screen.getByText('05:00')).toBeInTheDocument()
    expect(screen.queryByText(/이제 파는 게 좋습니다/)).not.toBeInTheDocument()

    // 4분 30초를 흘려보낸다 — 1초 간격 타이머가 그만큼 다시 그린다.
    await act(async () => vi.advanceTimersByTime(270_000))
    expect(screen.getByText('00:30')).toBeInTheDocument()
    expect(screen.getByText(/이제 파는 게 좋습니다/)).toBeInTheDocument()
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
    expect(screen.queryByText(/이제 파는 게 좋습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText(/시간이 끝나면 이번 연습은 여기서 멈춥니다/)).not.toBeInTheDocument()
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
    expect(screen.getByText('손절선 아래에서 파셨습니다.')).toBeInTheDocument()
    expect(screen.getByText(/잘못하신 게 아닙니다/)).toBeInTheDocument()
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

  it('종목 목록은 고른 뒤에도 컬럼에 남고, 다시 고를 수는 없다', async () => {
    // 모의투자 화면처럼 목록·차트·주문이 항상 같이 보인다. 다만 attempt 는 종목 하나에 묶여 있어
    // 이미 고른 뒤에는 목록이 읽기 전용이다.
    renderFlow(attempt({ riskSnapshot: null }), progress())
    await flushPromises()

    const row = screen.getByRole('button', { name: /연습 코인/ })
    expect(row).toBeDisabled()
    expect(row).toHaveAttribute('aria-current', 'true')
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

  it('끝낸 단계는 지우지 않고 접힌 완료 한 줄로 남기며 전체 진행도를 보여준다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(screen.getByText(/1\. 고르기 완료/)).toBeInTheDocument()
    expect(screen.getByText(/2\. 구매 완료 · 2개를 10,000원에 샀습니다/)).toBeInTheDocument()
    expect(screen.getByText('4단계 중 3단계 · 지켜보기')).toBeInTheDocument()
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
      prompt: '오늘 왜 그렇게 사고팔았나요?',
      answer: '한 줄 기록',
      createdAt: '2026-08-14T12:10:00',
      rewardGranted: true,
    })
    // 저장 뒤 onRefresh로 갱신된 progress를 흉내 낸다 — 금액은 progress.rewardAmount에서만 읽는다.
    renderFlow(attempt({ riskSnapshot: risk }), progress(reflectionReadyEvidence(), 'COMPLETED', 'COMPLETED'))
    await flushPromises()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await saveReflection()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('코인 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '실전 거래 시작하기' })).toHaveAttribute('href', '/trade')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('재완료(rewardGranted=false)에는 축하 모달을 열지 않는다', async () => {
    // 040(이슈 #402) 재완료는 새 reflection 행도 보상도 없다 — 받지 않은 돈을 축하하면 거짓말이 된다.
    vi.mocked(saveHoldingReflection).mockResolvedValue({
      reflectionId: null,
      holdingId: 41,
      prompt: '오늘 왜 그렇게 사고팔았나요?',
      answer: '한 줄 기록',
      createdAt: '2026-08-14T12:10:00',
      rewardGranted: false,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(reflectionReadyEvidence(), 'COMPLETED', 'COMPLETED'))
    await flushPromises()

    await saveReflection()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

    // 코인은 모의투자 화면과 같이 금액으로 산다 — 제목·입력 라벨이 함께 "얼마어치"여야 한다.
    expect(screen.getByRole('heading', { name: '2. 얼마어치 구매할지 정합니다 (매수)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지금 값에 구매하기' })).toBeInTheDocument()
    expect(screen.getByText(/얼마어치 구매할까요/)).toBeInTheDocument()
    // 모든 문장에 (매수)를 달면 읽기가 나빠진다 — 단계마다 처음 나오는 한 곳에만 병기한다.
    expect(screen.getAllByText(/\(매수\)/)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /사기|팔기/ })).not.toBeInTheDocument()
  })

  it('판매 단계도 같은 규칙으로 판매하기를 쓰고 (매도)를 한 곳에만 병기한다', async () => {
    const currentEvidence = evidence({
      buyTradeId: 31, holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2,
    })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(
      screen.getByRole('heading', { name: '4. 판매(매도)하고, 왜 그랬는지 적어 봅니다' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가진 2개 전부 판매하기' })).toBeInTheDocument()
    expect(screen.getAllByText(/\(매도\)/)).toHaveLength(1)
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

    fireEvent.click(await screen.findByRole('button', { name: '예약 값 고치기' }))
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

    expect(await screen.findByText('예약을 취소했습니다. 체결되지 않았습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '예약 값 고치기' })).not.toBeInTheDocument()
    expect(amendLimitOrder).not.toHaveBeenCalled()
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
    expect(screen.getByText('예약한 값에 체결됐습니다. 1개를 123원에 구매했습니다.')).toBeInTheDocument()
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
      screen.getByText('예약이 대기 목록에서 사라졌습니다. 체결됐는지 취소됐는지는 확인하지 못했습니다.'),
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
    const sellCard = screen.getByRole('heading', { name: /4\. 판매/ }).closest('.bezel-core')
    expect(sellCard).not.toBeNull()
    expect(sellCard).toContainElement(pendingCard)
    // 두 곳에 동시에 나오면 사용자는 예약을 두 개 건 줄 안다.
    expect(screen.getAllByText(/정한 값이 되기를 기다리는 중입니다/)).toHaveLength(1)

    expect(screen.getByRole('button', { name: '가진 2개 정한 값에 판매하기' })).toBeDisabled()
    expect(sellCard).toContainElement(
      screen.getByText(/바로 아래 예약해 둔 주문이 기다리는 중이라 지금은 새로 주문할 수 없어요/),
    )
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
