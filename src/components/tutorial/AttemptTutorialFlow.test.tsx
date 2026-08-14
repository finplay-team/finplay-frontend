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
import { loadInstruments } from '../../services/instrumentService'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import { AttemptTutorialFlow } from './AttemptTutorialFlow'

vi.mock('../CandleChart', () => ({
  CandleChart: ({ candles }: { candles: unknown[] }) => <div data-testid="practice-chart">{candles.length}</div>,
}))
vi.mock('../../hooks/useIdempotencyKey', () => ({ useIdempotencyKey: () => 'tutorial-key' }))
vi.mock('../../lib/accountPulse', () => ({ bumpAccount: vi.fn() }))
vi.mock('../../lib/tutorialPulse', () => ({ bumpTutorial: vi.fn() }))
vi.mock('../../services/instrumentService', () => ({ loadInstruments: vi.fn() }))
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

describe('AttemptTutorialFlow', () => {
  beforeEach(() => {
    vi.mocked(getPracticeAttemptChart).mockResolvedValue(chart)
    vi.mocked(tickPracticeAttempt).mockResolvedValue(chart)
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

  it.each([
    ['selection', attempt({ status: 'SELECTING_INSTRUMENT', instrumentId: null }), progress()],
    ['buy', attempt({ riskSnapshot: null }), progress()],
    ['observe', attempt({ riskSnapshot: risk }), progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 2 }))],
    ['sell', attempt({ riskSnapshot: risk }), progress(evidence({ holdingId: 41, observationId: 51, buyQuantity: 2, remainingQuantity: 2 }))],
  ])('requires confirmation before restart in the %s stage', async (_stage, currentAttempt, currentProgress) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderFlow(currentAttempt, currentProgress)
    const restart = screen.getByRole('button', { name: '처음부터 다시 시작' })

    fireEvent.click(restart)
    expect(restartPracticeAttempt).not.toHaveBeenCalled()
    fireEvent.click(restart)
    await waitFor(() => expect(restartPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('shows the restart path when step 4 is expired', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderFlow(
      attempt({ riskSnapshot: risk }),
      progress(evidence({ holdingId: 41, buyQuantity: 2, remainingQuantity: 2 }), 'EXPIRED', 'EXPIRED'),
    )

    expect(screen.getByText(/이번 실행의 매도 시간이 만료되었습니다/)).toBeInTheDocument()
    const restart = screen.getByRole('button', { name: '처음부터 다시 시작' })
    expect(screen.queryByRole('button', { name: /매수|매도|관찰/ })).not.toBeInTheDocument()
    fireEvent.click(restart)
    expect(restartPracticeAttempt).not.toHaveBeenCalled()
    fireEvent.click(restart)
    await waitFor(() => expect(restartPracticeAttempt).toHaveBeenCalledWith('CRYPTO'))
    expect(confirm).toHaveBeenCalledTimes(2)
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
    expect(screen.queryByRole('button', { name: '처음부터 다시 시작' })).not.toBeInTheDocument()
    expect(tickPracticeAttempt).not.toHaveBeenCalled()
    expect(placeOrder).not.toHaveBeenCalled()
    expect(placeLimitOrder).not.toHaveBeenCalled()
    expect(recordHoldingObservation).not.toHaveBeenCalled()
    expect(saveHoldingReflection).not.toHaveBeenCalled()
    expect(restartPracticeAttempt).not.toHaveBeenCalled()
  })
})
