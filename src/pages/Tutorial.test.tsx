// 튜토리얼 페이지가 진입·시장 전환에만 attempt를 ensure하고, 첫 화면 문구·상태 표시가 초보자 기준인지 검증한다.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentPracticeResponse, PracticeAttemptResponse } from '../services/tutorialTypes'
import { ensurePracticeAttempt, getPracticeProgress } from '../services/tutorialService'
import { Tutorial } from './Tutorial'

vi.mock('../services/tutorialService', () => ({
  ensurePracticeAttempt: vi.fn(),
  getPracticeProgress: vi.fn(),
}))
vi.mock('../components/tutorial/AttemptTutorialFlow', () => ({
  AttemptTutorialFlow: ({
    attempt,
    onRefresh,
  }: {
    attempt: PracticeAttemptResponse
    onRefresh: () => Promise<void>
  }) => (
    <div data-testid="attempt-flow">
      {attempt.market}:{attempt.runNumber}
      <button type="button" onClick={() => void onRefresh()}>진행만 새로고침</button>
    </div>
  ),
}))

function attempt(market: 'STOCK' | 'CRYPTO'): PracticeAttemptResponse {
  return {
    attemptId: market === 'CRYPTO' ? 10 : 20,
    market,
    runNumber: 1,
    mode: 'ACTIVE',
    status: 'SELECTING_INSTRUMENT',
    instrumentId: null,
    anchorAt: null,
    tutorialDate: null,
    riskSnapshot: null,
    completedAt: null,
  }
}

function progress(
  market: 'STOCK' | 'CRYPTO',
  overrides: Partial<InvestmentPracticeResponse> = {},
): InvestmentPracticeResponse {
  return {
    tutorialKey: market === 'CRYPTO' ? 'COIN_PRACTICE_V1' : 'INVESTMENT_PRACTICE_V1',
    status: 'IN_PROGRESS',
    currentStep: 1,
    steps: [],
    entries: [],
    priceAfterSell: null,
    revealedEvents: [],
    completedAt: null,
    rewardAmount: null,
    attempt: attempt(market),
    ...overrides,
  }
}

describe('Tutorial attempt entry', () => {
  beforeEach(() => {
    vi.mocked(ensurePracticeAttempt).mockImplementation(async (market) => attempt(market))
    vi.mocked(getPracticeProgress).mockImplementation(async (market) => progress(market))
  })

  /** 주식 입구를 닫아 둔 동안에도 탭이 남아야 하는 "이미 종목을 고른" 주식 사용자. */
  function withRunningStock() {
    vi.mocked(getPracticeProgress).mockImplementation(async (market) =>
      market === 'STOCK'
        ? progress('STOCK', {
            attempt: { ...attempt('STOCK'), status: 'IN_PROGRESS', instrumentId: 7 },
          })
        : progress(market),
    )
  }

  it('ensures on entry and market switch, but child tick/mutation refresh only GETs progress', async () => {
    // 시장 전환을 검증하려면 주식 탭이 있어야 한다 — 입구가 닫혀 있어도 진행 중이면 남는다.
    withRunningStock()
    render(<Tutorial />)

    // 기본 시장은 코인이다 — 주식 튜토리얼 입구를 가려 두었다.
    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('CRYPTO:1'))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)
    expect(ensurePracticeAttempt).toHaveBeenCalledWith('CRYPTO')

    fireEvent.click(screen.getByRole('button', { name: '진행만 새로고침' }))
    await waitFor(() => expect(vi.mocked(getPracticeProgress).mock.calls.filter(([market]) => market === 'CRYPTO'))
      .toHaveLength(2))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)

    fireEvent.click(await screen.findByRole('button', { name: '주식' }))
    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('STOCK:1'))
    expect(ensurePracticeAttempt).toHaveBeenNthCalledWith(2, 'STOCK')
  })

  it('hides the stock entrance entirely for a user who never picked a stock instrument', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByTestId('attempt-flow')).toHaveTextContent('CRYPTO:1')
    expect(screen.queryByRole('button', { name: '주식' })).not.toBeInTheDocument()
    expect(screen.queryByText(/주식 ·/)).not.toBeInTheDocument()
    // 화면을 열기만 해도 attempt는 IN_PROGRESS로 생기므로, 그것만으로 입구를 열면 가리는 의미가 없다.
    expect(ensurePracticeAttempt).not.toHaveBeenCalledWith('STOCK')
  })

  it('keeps the stock entrance for a user who is already running the stock tutorial', async () => {
    withRunningStock()
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(await screen.findByRole('button', { name: '주식' })).toBeInTheDocument()
    expect(screen.getByText('주식 · 진행 중')).toBeInTheDocument()
  })

  it('does not render the removed intention, stop-loss, or take-profit inputs', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.queryByRole('textbox', { name: /의도|손절|익절/ })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('attempt-flow')).toHaveLength(1)
  })

  it('opens with a beginner-facing intro: no internal jargon, and a next action to take', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText(/한 번 사고, 팔아 보는 연습입니다/)).toBeInTheDocument()
    // 종목 목록이 왼쪽 컬럼으로 옮겨가면서 가리키는 방향도 바뀌었다.
    expect(screen.getByText('왼쪽 목록에서 종목을 하나 고르는 것부터 시작하세요.')).toBeInTheDocument()
    // 초보자가 모르는 내부 용어는 첫 화면에서 사라져야 한다.
    expect(screen.queryByText(/영속|29\+1|사전 의도|복기/)).not.toBeInTheDocument()
  })

  it('never promises a sale deadline in the intro — 코인 대본에는 마감이 없다', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.queryByText(/5분 안에 팔아야/)).not.toBeInTheDocument()
  })

  it('mentions the other market only when both are actually reachable', async () => {
    const { unmount } = render(<Tutorial />)
    await screen.findByTestId('attempt-flow')
    expect(screen.queryByText(/주식과 코인은 서로 다른 연습입니다/)).not.toBeInTheDocument()
    unmount()

    withRunningStock()
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')
    expect(await screen.findByText(/주식과 코인은 서로 다른 연습입니다/)).toBeInTheDocument()
  })

  it('labels an unstarted market as 아직 안 함 and never shows a loading-only status word', async () => {
    vi.mocked(getPracticeProgress).mockImplementation(async (market) =>
      progress(market, { status: 'NOT_STARTED', currentStep: null }),
    )
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText('코인 · 아직 안 함')).toBeInTheDocument()
    // '확인 전'은 로딩 상태였을 뿐인데 사용자가 해야 할 일로 읽혔고, '선택 대기'는 주체가 모호했다.
    expect(screen.queryByText(/확인 전|선택 대기/)).not.toBeInTheDocument()
  })

  it('states the reward without a number until the server actually returns one', async () => {
    const { unmount } = render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText(/한 시장을 처음 끝내면 연습용 투자금이 한 번 지급됩니다\./)).toBeInTheDocument()
    expect(screen.queryByText(/원이 한 번 지급/)).not.toBeInTheDocument()
    unmount()

    vi.mocked(getPracticeProgress).mockImplementation(async (market) =>
      progress(market, { status: 'COMPLETED', currentStep: null, rewardAmount: 5_000_000 }),
    )
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(
      screen.getByText(/한 시장을 처음 끝내면 연습용 투자금 500만원이 한 번 지급됩니다\./),
    ).toBeInTheDocument()
  })
})
