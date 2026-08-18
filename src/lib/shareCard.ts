// 매도 회고 응답을 수익 인증 카드 데이터로 매핑하고, 카드 생성 가능 여부를 판정하는 순수 로직
import type { OrderSide } from '../services/types'
import type { PostSellFeedbackResponse } from '../services/feedbackTypes'

export interface ShareCardData {
  name: string
  symbol: string
  buyPrice: number
  sellPrice: number
  /** scale-4 비율. -0.0182 == -1.82% */
  returnRate: number
  pnlAmount: number
  isGain: boolean
}

/** 매도 회고(FEED-007) 응답을 카드에 필요한 필드만 추려 담는다. */
export function toShareCardData(feedback: PostSellFeedbackResponse): ShareCardData {
  return {
    name: feedback.name,
    symbol: feedback.symbol,
    buyPrice: feedback.buyPrice,
    sellPrice: feedback.sellPrice,
    returnRate: feedback.returnRate,
    pnlAmount: feedback.realizedPnl,
    isGain: feedback.realizedPnl >= 0,
  }
}

/**
 * 카드는 매도 회고(FEED-007) 데이터로 그린다. 이 API 자체는 코인 매도 체결에도 200을 준다(이슈 #275로
 * 이미 지원됨, `docs/api-routes.md` 참고) — 다만 매수 체결에는 응답하지 않는다. 코인을 막는 건 이 API의
 * 제약이 아니라 Portfolio.tsx 의 기존 PostSellFeedback 노출 조건(`trade.side === 'SELL' && !isCrypto`)을
 * 그대로 따르기 위해서다 — 트리거 버튼을 그 조건과 다르게 두면 "저긴 되는데 카드는 왜 안 되지" 하는
 * 혼란을 준다. 코인 지원은 그 기존 UI 게이트를 여는 별도 작업이 필요하다(이 기능의 범위 밖).
 */
export function canCreateShareCard(side: OrderSide, isCrypto: boolean): boolean {
  return side === 'SELL' && !isCrypto
}
