// 거래 도메인 enum 값을 한국어 라벨로 변환하는 매핑 모음
import type { DecisionBasis, OrderSide } from '../services/types'

export const basisLabels: Record<DecisionBasis, string> = {
  NEWS: '뉴스',
  TECHNICAL: '기술적 분석',
  LONGTERM: '장기 투자',
  GUT: '감',
  ETC: '기타',
}

export const basisOrder: DecisionBasis[] = ['NEWS', 'TECHNICAL', 'LONGTERM', 'GUT', 'ETC']

export const sideLabels: Record<OrderSide, string> = {
  BUY: '매수',
  SELL: '매도',
}
