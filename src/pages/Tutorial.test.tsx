// 튜토리얼 페이지가 진입·시장 전환에만 attempt를 ensure하고 이후 새로고침은 진행 조회만 하는지 검증한다.
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

function progress(market: 'STOCK' | 'CRYPTO'): InvestmentPracticeResponse {
  return {
    tutorialKey: market === 'CRYPTO' ? 'COIN_PRACTICE_V1' : 'INVESTMENT_PRACTICE_V1',
    status: 'IN_PROGRESS',
    currentStep: 1,
    steps: [],
    completedAt: null,
    rewardAmount: null,
    attempt: attempt(market),
  }
}

describe('Tutorial attempt entry', () => {
  beforeEach(() => {
    vi.mocked(ensurePracticeAttempt).mockImplementation(async (market) => attempt(market))
    vi.mocked(getPracticeProgress).mockImplementation(async (market) => progress(market))
  })

  it('ensures on entry and market switch, but child tick/mutation refresh only GETs progress', async () => {
    render(<Tutorial />)

    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('CRYPTO:1'))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)
    expect(ensurePracticeAttempt).toHaveBeenCalledWith('CRYPTO')

    fireEvent.click(screen.getByRole('button', { name: '진행만 새로고침' }))
    await waitFor(() => expect(vi.mocked(getPracticeProgress).mock.calls.filter(([market]) => market === 'CRYPTO'))
      .toHaveLength(2))
    expect(ensurePracticeAttempt).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '주식' }))
    await waitFor(() => expect(screen.getByTestId('attempt-flow')).toHaveTextContent('STOCK:1'))
    expect(ensurePracticeAttempt).toHaveBeenNthCalledWith(2, 'STOCK')
  })

  it('does not render the removed intention, stop-loss, or take-profit inputs', async () => {
    render(<Tutorial />)
    await screen.findByTestId('attempt-flow')

    expect(screen.queryByRole('textbox', { name: /의도|손절|익절/ })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('attempt-flow')).toHaveLength(1)
  })
})
