// AI 복기 화면이 코인 매도까지 조회하는지, 시장 탭 전환이 그 시장으로 다시 부르는지 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstruments } from '../hooks/useInstruments'
import { getTrades } from '../services/tradeService'
import type { Trade } from '../services/types'
import { Feedback } from './Feedback'

vi.mock('../services/tradeService', () => ({ getTrades: vi.fn() }))
vi.mock('../hooks/useInstruments', () => ({ useInstruments: vi.fn() }))
// 복기 본문은 이 화면의 관심사가 아니다 — 여기서 보는 것은 "어떤 시장의 체결을 목록에 올리는가"다.
vi.mock('../components/feedback/PostSellFeedback', () => ({
  PostSellFeedback: ({ tradeId }: { tradeId: number }) => <div>복기 본문 {tradeId}</div>,
}))

function sellTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: 411,
    instrumentId: 17,
    side: 'SELL',
    price: 89_569_000,
    quantity: 0.00586117,
    amount: 524_979,
    fee: 262,
    realizedPnl: -8_341,
    executedAt: '2026-08-19T19:34:36',
    ...overrides,
  }
}

describe('AI 복기 — 시장 선택', () => {
  beforeEach(() => {
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
    vi.mocked(getTrades).mockResolvedValue({ content: [sellTrade()], nextCursor: null, hasNext: false })
  })

  /*
   * 회귀: 이 화면은 `market: 'STOCK'` 을 고정으로 넘겨 코인 매도를 아예 조회하지 않았다. 근거였던
   * "코인 체결은 400" 은 백엔드 이슈 #275 로 200 이 되면서 폐기됐는데 화면이 따라가지 않아, 서버가
   * 서술까지 만들어 둔 코인 복기를 사용자가 볼 방법이 없었다.
   */
  it('기본 진입에서 코인 매도를 조회하고 목록에 올린다', async () => {
    render(<Feedback />)

    await waitFor(() =>
      expect(vi.mocked(getTrades)).toHaveBeenCalledWith(expect.objectContaining({ market: 'CRYPTO' })),
    )
    expect(vi.mocked(getTrades)).not.toHaveBeenCalledWith(expect.objectContaining({ market: 'STOCK' }))
    expect(await screen.findByRole('button', { name: /복기 보기/ })).toBeInTheDocument()
  })

  it('주식 탭을 누르면 그 시장으로 다시 조회한다', async () => {
    render(<Feedback />)
    await screen.findByRole('button', { name: /복기 보기/ })

    fireEvent.click(screen.getByRole('button', { name: '주식' }))

    await waitFor(() =>
      expect(vi.mocked(getTrades)).toHaveBeenCalledWith(expect.objectContaining({ market: 'STOCK' })),
    )
  })

  it('코인 매도를 펼치면 복기 본문이 그 체결 id 로 마운트된다', async () => {
    render(<Feedback />)

    fireEvent.click(await screen.findByRole('button', { name: /복기 보기/ }))

    expect(await screen.findByText('복기 본문 411')).toBeInTheDocument()
  })
})
