// 매매 카드(sharedTrade)를 실제 UI로 렌더링하는 TradeShareCard 의 표시 내용을 검증한다
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SharedTrade } from '../../services/types'
import { TradeShareCard } from './TradeShareCard'

function trade(overrides: Partial<SharedTrade> = {}): SharedTrade {
  return {
    symbol: 'BTC',
    name: '비트코인',
    market: 'CRYPTO',
    buyPrice: 50_000_000,
    sellPrice: 56_900_000,
    quantity: 0.001,
    realizedPnl: 6_900,
    returnRate: 0.138,
    ...overrides,
  }
}

describe('TradeShareCard', () => {
  it('종목명·심볼·매도 배지·수익률·손익·매수가·매도가·수량을 보여준다', () => {
    render(<TradeShareCard trade={trade()} />)

    expect(screen.getByText('매도')).toBeInTheDocument()
    expect(screen.getByText('코인')).toBeInTheDocument()
    expect(screen.getByText('비트코인')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('+13.80%')).toBeInTheDocument()
    expect(screen.getByText('+6,900원')).toBeInTheDocument()
    expect(screen.getByText('50,000,000원')).toBeInTheDocument()
    expect(screen.getByText('56,900,000원')).toBeInTheDocument()
  })

  it('수익이면 gain(적색) 톤, 손실이면 loss(청색) 톤 클래스를 쓴다', () => {
    const { rerender } = render(<TradeShareCard trade={trade({ realizedPnl: 6_900 })} />)
    expect(screen.getByText('+13.80%')).toHaveClass('text-gain')

    rerender(
      <TradeShareCard
        trade={trade({ realizedPnl: -3_000, returnRate: -0.06, buyPrice: 50_000, sellPrice: 47_000 })}
      />,
    )
    expect(screen.getByText('−6.00%')).toHaveClass('text-loss')
  })

  it('주식 매매는 "주식" 라벨을 보여준다', () => {
    render(<TradeShareCard trade={trade({ market: 'STOCK', symbol: '005930', name: '삼성전자' })} />)
    expect(screen.getByText('주식')).toBeInTheDocument()
  })
})
