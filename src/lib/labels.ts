// 거래 도메인 enum 값을 한국어 라벨로 변환하는 매핑 모음
import type { OrderSide } from '../services/types'

export const sideLabels: Record<OrderSide, string> = {
  BUY: '매수',
  SELL: '매도',
}
