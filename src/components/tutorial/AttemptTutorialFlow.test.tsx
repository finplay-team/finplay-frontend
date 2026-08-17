// 영속 attempt 튜토리얼의 단일 차트 폴링·재시작·주문·replay 상태를 DOM에서 검증한다.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeOverallStatus,
  PracticeTutorialChartResponse,
} from '../../services/tutorialTypes'
import {
  getPracticeAttemptChart,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import type { OrderSummary } from '../../services/types'
import { AttemptTutorialFlow } from './AttemptTutorialFlow'

vi.mock('../CandleChart', () => ({
  CandleChart: ({ candles }: { candles: unknown[] }) => <div data-testid="practice-chart">{candles.length}</div>,
}))
vi.mock('../../hooks/useIdempotencyKey', () => ({ useIdempotencyKey: () => 'tutorial-key' }))
vi.mock('../../lib/tutorialPulse', () => ({ bumpTutorial: vi.fn() }))
vi.mock('../../services/instrumentService', () => ({
  loadInstruments: vi.fn(),
  ensureInstrumentCache: vi.fn(),
  getCachedInstrument: vi.fn(),
}))
vi.mock('../../services/orderService', () => ({
  cancelLimitOrder: vi.fn(),
  getPendingOrders: vi.fn(),
  placeLimitOrder: vi.fn(),
  placeOrder: vi.fn(),
}))
vi.mock('../../services/tutorialService', () => ({
  getPracticeAttemptChart: vi.fn(),
  recordHoldingObservation: vi.fn(),
  restartPracticeAttempt: vi.fn(),
  saveHoldingReflection: vi.fn(),
  selectPracticeInstrument: vi.fn(),
  tickPracticeAttempt: vi.fn(),
}))

const chart: PracticeTutorialChartResponse = {
  attemptId: 10,
  runNumber: 1,
  instrumentId: 701,
  virtualDateTime: '2026-08-14T12:00:00',
  secondsPerVirtualMinute: 3,
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
    ...overrides,
  }
}

function progress(
  currentEvidence = evidence(),
  status: InvestmentPracticeResponse['status'] = 'IN_PROGRESS',
  stepFourStatus: PracticeOverallStatus = 'IN_PROGRESS',
): InvestmentPracticeResponse {
  return {
    tutorialKey: 'COIN_PRACTICE_V1',
    status,
    currentStep: status === 'COMPLETED' ? null : 2,
    completedAt: status === 'COMPLETED' ? '2026-08-14T12:10:00' : null,
    rewardAmount: status === 'COMPLETED' ? 5_000_000 : null,
    attempt: null,
    steps: [
      { step: 1, status: 'COMPLETED', locked: false, evidence: currentEvidence },
      { step: 2, status: 'COMPLETED', locked: false, evidence: currentEvidence },
      { step: 3, status: 'IN_PROGRESS', locked: false, evidence: currentEvidence },
      { step: 4, status: stepFourStatus, locked: false, evidence: currentEvidence },
    ],
  }
}

function renderFlow(
  currentAttempt = attempt(),
  currentProgress = progress(),
  onRefresh = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <AttemptTutorialFlow
      market={currentAttempt.market}
      attempt={currentAttempt}
      progress={currentProgress}
      onAttemptChange={vi.fn()}
      onRefresh={onRefresh}
    />,
  )
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function pendingSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
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
    vi.mocked(getPendingOrders).mockResolvedValue({ content: [], nextCursor: null, hasNext: false })
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

    expect(screen.getByRole('button', { name: '시장가 매수' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가' }))
    fireEvent.click(screen.getByRole('button', { name: '현재가' }))
    expect(screen.getByLabelText('지정가')).toHaveValue('123')
    fireEvent.click(screen.getByRole('button', { name: '지정가 매수 주문' }))

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
    expect(await screen.findByText(/매수 지정가 주문이 체결을 기다리고 있습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(88))
  })

  it('hydrates and cancels only a pending limit order attributed to the exact attempt and run', async () => {
    vi.mocked(getPendingOrders).mockResolvedValue({
      content: [
        pendingSummary({ orderId: 81, practiceAttemptId: null, practiceAttemptRunNumber: null }),
        pendingSummary({ orderId: 82, practiceAttemptRunNumber: 0 }),
        pendingSummary({ orderId: 83 }),
      ],
      nextCursor: null,
      hasNext: false,
    })

    renderFlow()

    expect(await screen.findByText(/매수 지정가 주문이 체결을 기다리고 있습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지정가 주문 취소' }))
    await waitFor(() => expect(cancelLimitOrder).toHaveBeenCalledWith(83))
    expect(cancelLimitOrder).not.toHaveBeenCalledWith(81)
    expect(cancelLimitOrder).not.toHaveBeenCalledWith(82)
  })

  it('ignores ordinary and stale-run pending orders for the same instrument and never cancels them', async () => {
    vi.mocked(getPendingOrders).mockResolvedValue({
      content: [
        pendingSummary({ orderId: 91, practiceAttemptId: null, practiceAttemptRunNumber: null }),
        pendingSummary({ orderId: 92, practiceAttemptRunNumber: 2 }),
      ],
      nextCursor: null,
      hasNext: false,
    })

    renderFlow()
    await waitFor(() => expect(getPendingOrders).toHaveBeenCalledWith({ market: 'CRYPTO', limit: 100 }))

    expect(screen.queryByText(/지정가 주문이 체결을 기다리고 있습니다/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지정가 주문 취소' })).not.toBeInTheDocument()
    expect(cancelLimitOrder).not.toHaveBeenCalled()
  })

  it('keeps STOCK market-only because the backend rejects stock limit orders', async () => {
    renderFlow(
      attempt({ market: 'STOCK', instrumentId: 801, riskSnapshot: null }),
      { ...progress(), tutorialKey: 'INVESTMENT_PRACTICE_V1' },
    )
    await waitFor(() => expect(getPracticeAttemptChart).toHaveBeenCalledWith('STOCK'))

    expect(screen.getByRole('button', { name: '시장가 매수' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지정가' })).not.toBeInTheDocument()
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
    expect(screen.queryByPlaceholderText('손절·익절 기준과 실제 판단을 돌아보세요.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '남은 1.25 전량 시장가 매도' }))

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

  it('매수 체결로 holding이 생기면 버튼 없이 관찰을 자동으로 한 번만 기록한다', async () => {
    const currentEvidence = evidence({ buyTradeId: 31, holdingId: 41, buyQuantity: 2, remainingQuantity: 2 })
    renderFlow(attempt({ riskSnapshot: risk }), progress(currentEvidence))
    await flushPromises()

    expect(recordHoldingObservation).toHaveBeenCalledTimes(1)
    expect(recordHoldingObservation).toHaveBeenCalledWith(41)
    expect(screen.queryByRole('button', { name: '현재 가격 관찰 기록' })).not.toBeInTheDocument()

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

    expect(
      screen.getByText('완료 보상은 이 시장에서 최초 1회만 지급됩니다. 재시작해 다시 완료해도 보상은 추가로 지급되지 않습니다.'),
    ).toBeInTheDocument()
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

    expect(screen.getByText(/이번 실행의 매도 시간이 만료되었습니다/)).toBeInTheDocument()
    const restart = screen.getByRole('button', { name: '처음부터 다시 시작' })
    expect(screen.queryByRole('button', { name: /매수|매도/ })).not.toBeInTheDocument()

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

    expect(screen.getByText('이 시장의 실습을 완료했습니다')).toBeInTheDocument()
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

  it('completed 이후 재시작하지 않고 replay 화면만 보는 사용자에게도 교육용 가상 시나리오 문구가 뜬다', async () => {
    // 040(이슈 #402)부터 완료 attempt도 재시작할 수 있지만, 재시작하지 않고 완료 기록만 다시 보는
    // 사용자를 위해 replay 화면에서도 시나리오 문구를 계속 노출한다.
    vi.mocked(getCachedInstrument).mockReturnValue({
      instrumentId: 701,
      market: 'CRYPTO',
      symbol: 'SANDBOX_COIN_1',
      name: '연습 코인',
      tickSize: 1,
      minOrderAmount: 5000,
      tradable: true,
      isTutorialSample: true,
    })
    const replayAttempt = attempt({ mode: 'REPLAY', status: 'COMPLETED', riskSnapshot: risk })
    renderFlow(replayAttempt, progress(
      evidence({ holdingId: 41, buyQuantity: 2, sellQuantity: 2, remainingQuantity: 0 }),
      'COMPLETED',
      'COMPLETED',
    ))
    await flushPromises()

    expect(
      await screen.findByText('알파코인이 주요 거래소에 추가 상장된다는 소식으로 주목받고 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '처음부터 다시 시작' })).toBeInTheDocument()
  })
})
