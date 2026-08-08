// 주문 생성·수정·취소·조회 서비스 (시장가는 즉시 체결, 지정가는 코인 전용으로 PENDING 생성)
import { api } from '../lib/apiClient'
import type {
  LimitOrderCreateRequest,
  LimitOrderResponse,
  LimitOrderUpdateRequest,
  Market,
  OrderCreateRequest,
  OrderExecutionResponse,
  OrderPage,
} from './types'

/** 커서 목록 공통 파라미터. limit 은 1~100 이며 범위 밖은 클램핑 없이 400 이다. */
interface PageParams {
  market: Market
  cursor?: string | null
  limit?: number
}

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

/**
 * 코인 지정가 주문 생성. 즉시체결 조건을 충족해도 거부되지 않고 항상 PENDING 으로 온다.
 *
 * 서버 해시에 limitPrice 가 포함되는지가 문서에 없어서(MUST-VERIFY) 두 가지를 방어한다.
 * 1) 호출부가 limitPrice 를 포함한 본문으로 키를 만든다 (hooks/useIdempotencyKey).
 * 2) 여기서 응답의 limitPrice·quantity 가 요청과 일치하는지 확인한다 — 어긋나면 조용한 replay 를
 *    맞은 것이므로 화면에 성공으로 보여주지 않는다. 409 보다 이 경우가 더 위험하다.
 */
export async function placeLimitOrder(
  req: LimitOrderCreateRequest,
  idempotencyKey: string,
): Promise<LimitOrderResponse> {
  const res = await api.post<LimitOrderResponse>('/orders/limit', req, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  // 문자열 비교 금지 — scale 이 엔드포인트마다 달라 "0.1" 과 0.10000000 이 함께 나온다.
  if (Number(res.limitPrice) !== Number(req.limitPrice) || Number(res.quantity) !== Number(req.quantity)) {
    throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  }
  return res
}

/**
 * PENDING 지정가 주문의 가격·수량 정정. Idempotency-Key 가 필요 없다(절대값 지정이라 자연 멱등).
 * 둘 다 생략하면 400 이므로 호출부에서 최소 하나를 채운다.
 * 예약 해제→재예약이 한 트랜잭션이라 부족하면 전부 롤백되고 변경 전 상태가 유지된다.
 */
export function amendLimitOrder(
  orderId: number,
  req: LimitOrderUpdateRequest,
): Promise<LimitOrderResponse> {
  return api.patch<LimitOrderResponse>(`/orders/${orderId}`, req)
}

/** PENDING 지정가 주문 취소 — 204, 본문 없음. 예약만 반환되고 잔고·수량 자체는 불변이다. */
export function cancelLimitOrder(orderId: number): Promise<void> {
  return api.del<void>(`/orders/${orderId}`)
}

/** GET /api/orders — market 필수. PENDING·FILLED·CANCELLED 전부 섞여 온다. */
export function getOrders(p: PageParams): Promise<OrderPage> {
  return api.get<OrderPage>('/orders', {
    query: { market: p.market, cursor: p.cursor ?? undefined, limit: p.limit },
  })
}

/**
 * GET /api/orders/pending — status=PENDING 만. 스냅샷이 아니라 조회 시점 실시간 목록이라
 * 체결·취소된 주문은 다음 조회에서 사라진다.
 *
 * 전체 목록을 받아 클라이언트에서 필터링하면 페이지 경계에서 누락이 생기므로 이 전용 경로를 쓴다.
 * 체결 알림(NOTI)이 아직 없어서 체결을 감지하는 유일한 방법이 이 목록 폴링이다.
 */
export function getPendingOrders(p: PageParams): Promise<OrderPage> {
  return api.get<OrderPage>('/orders/pending', {
    query: { market: p.market, cursor: p.cursor ?? undefined, limit: p.limit },
  })
}
