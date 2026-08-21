// 매도 체결 직후 결과 영역의 "수익 인증 카드로 공유하기" 버튼 노출·이동을 검증한다(코인·주식 모두 대상)
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import { useCandles } from '../hooks/useCandles'
import { useWatchlist } from '../hooks/useWatchlist'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { placeOrder } from '../services/orderService'
import type { AccountSummary, Holding, Instrument, OrderExecutionResponse } from '../services/types'
import { Trade } from './Trade'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../hooks/useInstruments', () => ({ useInstruments: vi.fn() }))
vi.mock('../hooks/useStockStream', () => ({ useStockStream: vi.fn() }))
vi.mock('../hooks/useCryptoPrices', () => ({ useCryptoPrices: vi.fn() }))
vi.mock('../hooks/useCandles', () => ({ useCandles: vi.fn() }))
vi.mock('../hooks/useWatchlist', () => ({ useWatchlist: vi.fn() }))
vi.mock('../services/accountService', () => ({ getAccountSummary: vi.fn() }))
vi.mock('../services/holdingService', () => ({ getHoldings: vi.fn() }))
vi.mock('../services/orderService', () => ({ placeOrder: vi.fn(), placeLimitOrder: vi.fn() }))
vi.mock('../components/trade/PendingOrders', () => ({ PendingOrders: () => null }))
vi.mock('../components/trade/CommunityPreview', () => ({ CommunityPreview: () => null }))
vi.mock('../components/tutorial/OrderTypeGuide', () => ({
  OrderTypeGuideButton: () => null,
  OrderTypeGuideDialog: () => null,
  hasSeenOrderTypeGuide: () => true,
  markOrderTypeGuideSeen: vi.fn(),
}))

const BTC: Instrument = {
  instrumentId: 17,
  market: 'CRYPTO',
  symbol: 'BTC',
  name: '비트코인',
  tickSize: 1000,
  minOrderAmount: 5000,
  tradable: true,
  isTutorialSample: false,
}

function account(): AccountSummary {
  return {
    cashBalance: 10_000_000,
    reservedCash: 0,
    holdingsValue: 0,
    totalValue: 10_000_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
  }
}

function holding(): Holding {
  return {
    holdingId: 1,
    instrumentId: 17,
    symbol: 'BTC',
    name: '비트코인',
    quantity: 1,
    reservedQuantity: 0,
    averagePrice: 50_000_000,
    currentPrice: 56_900_000,
    evaluationAmount: 56_900_000,
    unrealizedPnl: 6_900_000,
    returnRate: 0.138,
    priceStatus: 'AVAILABLE',
  }
}

function sellExecution(): OrderExecutionResponse {
  return {
    orderId: 1,
    market: 'CRYPTO',
    instrumentId: 17,
    side: 'SELL',
    orderType: 'MARKET',
    status: 'FILLED',
    quantity: 0.001,
    requestedAt: '2026-08-18T10:00:00',
    tradeId: 901,
    price: 56_900_000,
    amount: 56_900,
    fee: 28,
    realizedPnl: 6_900,
    executedAt: '2026-08-18T10:00:00',
  }
}

describe('Trade 매도 체결 결과 — 수익 인증 카드로 공유하기', () => {
  beforeEach(() => {
    vi.mocked(useInstruments).mockReturnValue({
      index: { byId: new Map([[17, BTC]]), bySymbol: new Map([['BTC', BTC]]) },
      loading: false,
      error: null,
    })
    vi.mocked(useStockStream).mockReturnValue({
      prices: {},
      marketStatus: null,
      sourceTradingDate: null,
      state: 'idle',
      lastMessageAt: null,
      error: null,
    })
    vi.mocked(useCryptoPrices).mockReturnValue({
      prices: { 17: { price: 56_900_000, sourceTime: '2026-08-18T10:00:00', status: 'AVAILABLE', sourceTradingDate: null } },
      lastUpdatedAt: Date.now(),
      error: null,
      refresh: vi.fn(),
    })
    vi.mocked(useCandles).mockReturnValue({
      candles: [],
      loading: false,
      error: null,
      reload: vi.fn(),
      loadOlder: vi.fn(),
      loadingOlder: false,
      hasMoreHistory: true,
    })
    vi.mocked(useWatchlist).mockReturnValue({
      items: [],
      error: null,
      busy: new Set(),
      toggle: vi.fn(),
      has: () => false,
    })
    vi.mocked(getAccountSummary).mockResolvedValue(account())
    vi.mocked(getHoldings).mockResolvedValue([holding()])
    mockNavigate.mockClear()
  })

  it('매도 체결 후 버튼을 누르면 sharedTradeId 를 들고 글쓰기 화면으로 이동한다(코인 포함)', async () => {
    vi.mocked(placeOrder).mockResolvedValue(sellExecution())

    render(
      <MemoryRouter>
        <Trade />
      </MemoryRouter>,
    )

    // 매도로 전환하고 보유 수량 전량(최대 버튼)을 채운 뒤 주문한다.
    fireEvent.click(await screen.findByRole('button', { name: '매도' }))
    fireEvent.click(await screen.findByRole('button', { name: '최대' }))
    fireEvent.click(screen.getByRole('button', { name: 'BTC 매도' }))

    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(1))
    const shareButton = await screen.findByRole('button', { name: '수익 인증 카드로 공유하기' })
    fireEvent.click(shareButton)

    expect(mockNavigate).toHaveBeenCalledWith('/community?instrumentId=17', { state: { sharedTradeId: 901 } })
  })
})
