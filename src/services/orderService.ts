// 시장가 주문 생성·주문 목록 조회 서비스 (지정가·미체결 개념은 백엔드에 없다)
import { api } from '../lib/apiClient'
import type { OrderCreateRequest, OrderExecutionResponse, OrderSummary } from './types'

/**
 * Idempotency-Key 는 필수 헤더다. 서버 요청 해시가
 * market:instrumentId:side:orderType:quantity 이므로 같은 키에 다른 본문을 보내면 409 IDEMPOTENCY_CONFLICT 다.
 * 키 생성은 hooks/useIdempotencyKey 에서 본문 의존으로 만든다.
 */
export function placeOrder(
  req: OrderCreateRequest,
  idempotencyKey: string,
): Promise<OrderExecutionResponse> {
  return api.post<OrderExecutionResponse>('/orders', req, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** 파라미터 없음. bare array 로 오고 symbol·name 이 없어 instrumentService 캐시 조인이 필요하다. */
export function getOrders(): Promise<OrderSummary[]> {
  return api.get<OrderSummary[]>('/orders')
}
