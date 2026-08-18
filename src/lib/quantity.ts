// 주문 수량의 소수 자릿수 상한과 잔고·보유수량 비율로 채울 수량을 계산하는 유틸
import type { OrderSide } from '../services/types'

/** 코인 수량 소수 자릿수 상한. 백엔드 scale 이 8 이다. */
export const CRYPTO_QTY_DECIMALS = 8

/**
 * 매수 수수료율. 백엔드가 매수 때 `amount + fee` 만큼 현금을 깎으므로(OrderExecutionService
 * `cashRequired`, 지정가는 LimitOrderFeeCalculator) 현금을 가격으로만 나누면 "최대"가 늘 잔고를
 * 넘겨 INSUFFICIENT_CASH 가 난다. 같은 값을 여기서도 빼 두고 계산한다.
 */
const FEE_RATE = { STOCK: 0.00015, CRYPTO: 0.0005 } as const

/** 코인은 소수 8자리까지, 주식은 정수 주까지만 주문할 수 있다 — 어느 쪽이든 내림한다. */
function floorToUnit(value: number, isCrypto: boolean): number {
  if (!isCrypto) return Math.floor(value)
  const scale = 10 ** CRYPTO_QTY_DECIMALS
  return Math.floor(value * scale) / scale
}

/**
 * 비율 버튼이 수량 입력창에 채울 수량. 계산할 수 없거나 한 단위도 못 채우면 0 이다.
 * 매수는 기준가(+수수료)로 나눠 살 수 있는 수량을, 매도는 보유 수량의 비율을 쓴다.
 */
export function presetQuantity(params: {
  side: OrderSide
  isCrypto: boolean
  /** 0 초과 1 이하. 1 은 매수 "최대" / 매도 "전량" 이다. */
  ratio: number
  /** 예약분을 뺀 주문가능 현금. 매수에서만 쓴다. */
  availableCash: number | null
  /** 예약분을 뺀 매도가능 수량. 매도에서만 쓴다. */
  held: number
  /** 매수 계산의 기준 가격 — 시장가는 현재가, 지정가는 입력한 지정가다. */
  unitPrice: number | null
}): number {
  const { side, isCrypto, ratio, availableCash, held, unitPrice } = params

  if (side === 'SELL') {
    if (held <= 0) return 0
    // 전량은 내림 오차 없이 보유 수량 그대로여야 한다 — 1주가 남으면 "전량"이 아니다.
    if (ratio >= 1) return held
    return floorToUnit(held * ratio, isCrypto)
  }

  if (availableCash === null || availableCash <= 0) return 0
  if (unitPrice === null || unitPrice <= 0) return 0
  const perUnitCost = unitPrice * (1 + (isCrypto ? FEE_RATE.CRYPTO : FEE_RATE.STOCK))
  return floorToUnit((availableCash * ratio) / perUnitCost, isCrypto)
}
