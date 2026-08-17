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

  it('ensures on entry and market switch, but child tick/mutation refresh only GETs progress', async () => {
    render(<Tutorial />)

    // 기본 시장이 주식이라 진입 ensure 대상도 STOCK이다.
    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('STOCK:1'))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)
    expect(ensurePracticeAttempt).toHaveBeenCalledWith('STOCK')

    fireEvent.click(screen.getByRole('button', { name: '진행만 새로고침' }))
    await waitFor(() => expect(vi.mocked(getPracticeProgress).mock.calls.filter(([market]) => market === 'STOCK'))
      .toHaveLength(2))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '코인' }))
    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('CRYPTO:1'))
    expect(ensurePracticeAttempt).toHaveBeenNthCalledWith(2, 'CRYPTO')
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
    expect(screen.getByText('아래에서 종목을 하나 고르는 것부터 시작하세요.')).toBeInTheDocument()
    // 초보자가 모르는 내부 용어는 첫 화면에서 사라져야 한다.
    expect(screen.queryByText(/영속|29\+1|사전 의도|복기/)).not.toBeInTheDocument()
    // 새로고침·다시 시작 같은 예외 설명은 접힌 영역으로 내렸다.
    expect(screen.getByText(/새로고침하거나 나갔다 돌아와도/).closest('details')).not.toBeNull()
  })

  it('tells the user the two markets are completed separately', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText(/주식과 코인은 서로 다른 연습입니다/)).toBeInTheDocument()
  })

  it('labels an unstarted market as 아직 안 함 and never shows a loading-only status word', async () => {
    vi.mocked(getPracticeProgress).mockImplementation(async (market) =>
      progress(market, { status: 'NOT_STARTED', currentStep: null }),
    )
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText('주식 · 아직 안 함')).toBeInTheDocument()
    // '확인 전'은 로딩 상태였을 뿐인데 사용자가 해야 할 일로 읽혔고, '선택 대기'는 주체가 모호했다.
    expect(screen.queryByText(/확인 전|선택 대기/)).not.toBeInTheDocument()
  })

  it('states the reward without a number until the server actually returns one', async () => {
    const { unmount } = render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.getByText('한 시장을 처음 끝내면 연습용 투자금이 한 번 지급됩니다.')).toBeInTheDocument()
    expect(screen.queryByText(/원이 한 번 지급/)).not.toBeInTheDocument()
    unmount()

    vi.mocked(getPracticeProgress).mockImplementation(async (market) =>
      progress(market, { status: 'COMPLETED', currentStep: null, rewardAmount: 5_000_000 }),
    )
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(
      screen.getByText('한 시장을 처음 끝내면 연습용 투자금 500만원이 한 번 지급됩니다.'),
    ).toBeInTheDocument()
  })
})
