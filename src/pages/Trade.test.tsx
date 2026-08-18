// 모의투자 화면의 코치마크가 처음 온 사람에게만 한 번씩 순서대로 뜨고, 다시 보기로 되살아나는지 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCandles } from '../hooks/useCandles'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import { useInstruments } from '../hooks/useInstruments'
import { useStockStream } from '../hooks/useStockStream'
import { useWatchlist } from '../hooks/useWatchlist'
import { getAccountSummary } from '../services/accountService'
import { getHoldings } from '../services/holdingService'
import { ORDER_TYPE_GUIDE_KEY } from '../components/tutorial/OrderTypeGuide'
import type { Instrument } from '../services/types'
import { Trade } from './Trade'

const PRICE_BAR_KEY = 'finplay.coach.trade.priceBar'
const PRESET_KEY = 'finplay.coach.trade.quantityPreset'
const PRICE_BAR_TITLE = '지금 값이 어디서든 따라다녀요'
const PRESET_TITLE = '얼마나 살지 한 번에 정할 수 있어요'

vi.mock('../hooks/useCandles', () => ({ useCandles: vi.fn() }))
vi.mock('../hooks/useCryptoPrices', () => ({ useCryptoPrices: vi.fn() }))
vi.mock('../hooks/useInstruments', () => ({ useInstruments: vi.fn() }))
vi.mock('../hooks/useStockStream', () => ({ useStockStream: vi.fn() }))
vi.mock('../hooks/useWatchlist', () => ({ useWatchlist: vi.fn() }))
vi.mock('../services/accountService', () => ({ getAccountSummary: vi.fn() }))
vi.mock('../services/holdingService', () => ({ getHoldings: vi.fn() }))
vi.mock('../services/orderService', () => ({ placeOrder: vi.fn(), placeLimitOrder: vi.fn() }))
// jsdom 에는 ResizeObserver 가 없어 실제 차트는 마운트되지 않는다. 코치마크가 가리키는 대상이
// 아니라 검증에는 영향이 없다.
vi.mock('../components/CandleChart', () => ({ CandleChart: () => <div data-testid="candle-chart" /> }))
// 미체결 목록과 커뮤니티 미리보기는 코치마크 대상이 아니고 각자 폴링을 돈다 — 화면에서 덜어낸다.
vi.mock('../components/trade/PendingOrders', () => ({ PendingOrders: () => null }))
vi.mock('../components/trade/CommunityPreview', () => ({ CommunityPreview: () => null }))

const btc: Instrument = {
  instrumentId: 1,
  market: 'CRYPTO',
  symbol: 'BTC',
  name: '비트코인',
  tickSize: 1,
  minOrderAmount: 5000,
  tradable: true,
  isTutorialSample: false,
}

function renderTrade() {
  return render(
    <MemoryRouter>
      <Trade />
    </MemoryRouter>,
  )
}

/** 첫 진입에 자동으로 뜨는 시장가·지정가 설명 모달은 코치마크를 덮는다 — 그것부터 본 상태로 만든다. */
function markOrderTypeGuideSeen() {
  localStorage.setItem(ORDER_TYPE_GUIDE_KEY, 'done')
}

describe('Trade 코치마크', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useInstruments).mockReturnValue({
      index: { byId: new Map([[btc.instrumentId, btc]]), bySymbol: new Map([[btc.symbol, btc]]) },
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
      prices: {
        [btc.instrumentId]: {
          price: 100_000_000,
          sourceTime: '2026-08-18T09:00:00',
          status: 'AVAILABLE',
          sourceTradingDate: null,
        },
      },
      lastUpdatedAt: Date.now(),
      error: null,
      refresh: vi.fn(),
    })
    vi.mocked(useCandles).mockReturnValue({ candles: [], loading: false, error: null, reload: vi.fn() })
    vi.mocked(useWatchlist).mockReturnValue({
      items: [],
      error: null,
      busy: new Set<number>(),
      toggle: vi.fn(),
      has: () => false,
    })
    vi.mocked(getAccountSummary).mockResolvedValue({
      cashBalance: 10_000_000,
      reservedCash: 0,
      holdingsValue: 0,
      totalValue: 10_000_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
    })
    vi.mocked(getHoldings).mockResolvedValue([])
    // jsdom 은 모든 좌표를 0 으로 준다 — 대상이 화면 안에 보이는 것으로 만들어 준다.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 40,
      right: 360,
      bottom: 250,
      width: 320,
      height: 50,
      x: 40,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect)
  })

  it('처음 들어온 사용자에게는 주문유형 설명을 닫은 뒤 첫 코치마크가 뜬다', async () => {
    renderTrade()

    // 설명 모달이 코치마크를 통째로 덮으므로 그 사이에는 띄우지 않는다.
    expect(await screen.findByText('시장가와 지정가, 뭐가 다른가요?')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PRICE_BAR_TITLE })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '알겠어요' }))

    expect(await screen.findByRole('dialog', { name: PRICE_BAR_TITLE })).toBeInTheDocument()
    // 한 번에 하나만 뜬다 — 두 번째는 첫 번째를 닫아야 나온다.
    expect(screen.queryByRole('dialog', { name: PRESET_TITLE })).not.toBeInTheDocument()
  })

  it('X 로 닫으면 다음 코치마크로 넘어가고, 마지막까지 닫으면 모두 사라진다', async () => {
    markOrderTypeGuideSeen()
    renderTrade()

    await screen.findByRole('dialog', { name: PRICE_BAR_TITLE })
    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }))

    expect(await screen.findByRole('dialog', { name: PRESET_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PRICE_BAR_TITLE })).not.toBeInTheDocument()
    expect(localStorage.getItem(PRICE_BAR_KEY)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem(PRESET_KEY)).not.toBeNull()
  })

  it('이미 다 본 사용자에게는 아무 코치마크도 뜨지 않는다', async () => {
    markOrderTypeGuideSeen()
    localStorage.setItem(PRICE_BAR_KEY, 'done')
    localStorage.setItem(PRESET_KEY, 'done')
    renderTrade()

    expect(await screen.findByRole('heading', { name: '주문' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('첫 번째만 보고 나간 사용자는 다음 방문에 두 번째부터 이어서 본다', async () => {
    // 저장 키를 대상별로 나눈 이유다 — 하나로 묶으면 못 본 두 번째를 영영 못 보거나 첫 번째를 또 본다.
    markOrderTypeGuideSeen()
    localStorage.setItem(PRICE_BAR_KEY, 'done')
    renderTrade()

    expect(await screen.findByRole('dialog', { name: PRESET_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PRICE_BAR_TITLE })).not.toBeInTheDocument()
  })

  it('"화면 안내 다시 보기"를 누르면 이미 본 코치마크도 처음 것부터 다시 뜬다', async () => {
    markOrderTypeGuideSeen()
    localStorage.setItem(PRICE_BAR_KEY, 'done')
    localStorage.setItem(PRESET_KEY, 'done')
    renderTrade()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '화면 안내 다시 보기' }))

    expect(await screen.findByRole('dialog', { name: PRICE_BAR_TITLE })).toBeInTheDocument()
    // 기록도 함께 지운다 — 안 지우면 새로고침하는 순간 다시 "이미 본" 상태로 돌아간다.
    expect(localStorage.getItem(PRICE_BAR_KEY)).toBeNull()
    expect(localStorage.getItem(PRESET_KEY)).toBeNull()
  })

  it('종목이 없어 현재가 바가 그려지지 않으면 그 코치마크는 조용히 건너뛴다', async () => {
    // 대상이 없을 때 빈 말풍선을 띄우면 안 된다. 다음 대상(비율 프리셋)은 그대로 뜬다.
    markOrderTypeGuideSeen()
    localStorage.setItem(PRICE_BAR_KEY, 'done')
    vi.mocked(useInstruments).mockReturnValue({
      index: { byId: new Map(), bySymbol: new Map() },
      loading: false,
      error: null,
    })
    renderTrade()

    expect(await screen.findByRole('dialog', { name: PRESET_TITLE })).toBeInTheDocument()
  })
})
