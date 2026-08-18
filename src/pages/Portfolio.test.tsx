// 체결 내역의 "수익 인증 카드 만들기" 버튼 노출·이동을 검증한다(코인·주식 모두 대상 — !isCrypto 게이트 제거)
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { getTrades } from '../services/tradeService'
import { getJournals } from '../services/journalService'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import type { AccountSummary, Trade } from '../services/types'
import { Portfolio } from './Portfolio'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../services/accountService', () => ({ getAccountSummary: vi.fn() }))
vi.mock('../services/holdingService', () => ({ getHoldings: vi.fn() }))
vi.mock('../services/tradeService', () => ({ getTrades: vi.fn() }))
vi.mock('../services/journalService', () => ({ getJournals: vi.fn() }))
vi.mock('../hooks/useInstruments', () => ({ useInstruments: vi.fn() }))
vi.mock('../hooks/useStockStream', () => ({ useStockStream: vi.fn() }))
vi.mock('../components/trade/PendingOrders', () => ({ PendingOrders: () => null }))
vi.mock('../components/feedback/PostSellFeedback', () => ({ PostSellFeedback: () => null }))

function account(): AccountSummary {
  return {
    cashBalance: 1_000_000,
    reservedCash: 0,
    holdingsValue: 0,
    totalValue: 1_000_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
  }
}

function sellTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: 501,
    instrumentId: 17,
    side: 'SELL',
    price: 50_000,
    quantity: 1,
    amount: 50_000,
    fee: 25,
    realizedPnl: 5_000,
    executedAt: '2026-08-18T10:00:00',
    ...overrides,
  }
}

describe('Portfolio 체결 내역 — 수익 인증 카드 만들기', () => {
  beforeEach(() => {
    vi.mocked(getAccountSummary).mockResolvedValue(account())
    vi.mocked(getHoldings).mockResolvedValue([])
    vi.mocked(getJournals).mockResolvedValue({ content: [], nextCursor: null, hasNext: false })
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
    vi.mocked(useStockStream).mockReturnValue({
      prices: {},
      marketStatus: null,
      sourceTradingDate: null,
      state: 'idle',
      lastMessageAt: null,
      error: null,
    })
    mockNavigate.mockClear()
  })

  it('코인 매도 체결에도 버튼이 뜨고, 클릭하면 sharedTradeId 를 들고 글쓰기 화면으로 이동한다', async () => {
    vi.mocked(getTrades).mockResolvedValue({
      content: [sellTrade()],
      nextCursor: null,
      hasNext: false,
    })

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '보기' }))
    const shareButton = await screen.findByRole('button', { name: '수익 인증 카드 만들기' })
    fireEvent.click(shareButton)

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/community', { state: { sharedTradeId: 501 } }),
    )
  })

  it('매수 체결에는 버튼이 뜨지 않는다', async () => {
    vi.mocked(getTrades).mockResolvedValue({
      content: [sellTrade({ tradeId: 502, side: 'BUY', realizedPnl: null })],
      nextCursor: null,
      hasNext: false,
    })

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '보기' }))
    expect(screen.queryByRole('button', { name: '수익 인증 카드 만들기' })).not.toBeInTheDocument()
  })
})
