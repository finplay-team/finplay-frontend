// 수익 인증 카드 데이터 매핑(toShareCardData)과 트리거 버튼 노출 조건(canCreateShareCard)을 검증한다
import { describe, expect, it } from 'vitest'
import { canCreateShareCard, toShareCardData } from './shareCard'
import type { PostSellFeedbackResponse } from '../services/feedbackTypes'

function feedback(overrides: Partial<PostSellFeedbackResponse> = {}): PostSellFeedbackResponse {
  return {
    tradeId: 1,
    instrumentId: 10,
    symbol: '005930',
    name: '삼성전자',
    buyAt: '2026-08-18T09:05:00',
    sellAt: '2026-08-18T10:10:00',
    buyPrice: 70000,
    sellPrice: 75000,
    quantity: 10,
    fee: 100,
    realizedPnl: 49900,
    returnRate: 0.07,
    holdingMinutes: 65,
    sameSessionCompleted: true,
    holdHighPrice: null,
    holdHighAt: null,
    holdLowPrice: null,
    holdLowAt: null,
    sellVsHighRate: null,
    sellVsLowRate: null,
    buyToNewsMinutes: null,
    priceMoves: [],
    postSellFlow: null,
    counterfactuals: null,
    peerComparison: null,
    narrative: '요약',
    narrativeSource: 'TEMPLATE',
    narrativeStatus: 'READY',
    ...overrides,
  }
}

describe('toShareCardData', () => {
  it('매도 회고 응답에서 카드에 필요한 필드만 추려 담는다', () => {
    const data = toShareCardData(feedback())

    expect(data).toEqual({
      name: '삼성전자',
      symbol: '005930',
      buyPrice: 70000,
      sellPrice: 75000,
      returnRate: 0.07,
      pnlAmount: 49900,
      isGain: true,
    })
  })

  it('실현손익이 음수면 isGain 이 false 다', () => {
    const data = toShareCardData(feedback({ realizedPnl: -12000, returnRate: -0.05 }))
    expect(data.isGain).toBe(false)
  })

  it('실현손익이 정확히 0이면 손실이 아니라 이득 쪽 색으로 취급한다(0 이상)', () => {
    const data = toShareCardData(feedback({ realizedPnl: 0, returnRate: 0 }))
    expect(data.isGain).toBe(true)
  })
})

describe('canCreateShareCard', () => {
  it('주식 매도 체결이면 카드를 만들 수 있다', () => {
    expect(canCreateShareCard('SELL', false)).toBe(true)
  })

  it('주식 매수 체결은 수익률이 없어 카드를 만들 수 없다', () => {
    expect(canCreateShareCard('BUY', false)).toBe(false)
  })

  it('코인 매도 체결은 매도 회고(FEED-007) 대상이 아니라 카드를 만들 수 없다', () => {
    expect(canCreateShareCard('SELL', true)).toBe(false)
  })

  it('코인 매수 체결도 카드를 만들 수 없다', () => {
    expect(canCreateShareCard('BUY', true)).toBe(false)
  })
})
