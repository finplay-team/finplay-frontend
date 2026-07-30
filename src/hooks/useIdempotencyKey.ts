// 주문 본문에 종속된 Idempotency-Key 를 생성하는 훅 (같은 본문 ⇒ 같은 키가 구조적으로 보장된다)
import { useMemo } from 'react'

/**
 * deps 가 그대로면 같은 키를 반환한다 → 같은 본문 재시도는 서버가 원래 응답을 재생한다.
 * deps 가 바뀌면 새 키를 반환한다 → 409 IDEMPOTENCY_CONFLICT 가 구조적으로 발생하지 않는다.
 */
export function useIdempotencyKey(deps: readonly unknown[]): string {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => newUuid(), deps)
}

function newUuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
