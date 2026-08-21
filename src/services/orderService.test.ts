// 지정가 주문의 조용한 멱등 replay가 "알 수 없는 오류"가 아니라 주문 상태 불명으로 올라오는지 검증한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isOrderStateUnknown, toUserMessage } from '../lib/errorMessages'
import { placeLimitOrder } from './orderService'
import type { LimitOrderResponse } from './types'

vi.mock('../lib/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/apiClient')>()),
  api: { post: vi.fn() },
}))

const { api } = await import('../lib/apiClient')

function response(overrides: { limitPrice: number; quantity: number }): LimitOrderResponse {
  return {
    orderId: 1,
    market: 'CRYPTO',
    instrumentId: 1,
    side: 'BUY',
    orderType: 'LIMIT',
    status: 'PENDING',
    requestedAt: '2026-08-21T10:00:00',
    ...overrides,
  }
}

describe('placeLimitOrder 응답 검증', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
  })

  it('표기만 다른 같은 값은 통과시킨다 — 요청은 문자열, 응답은 수라 문자열 비교로는 걸린다', async () => {
    vi.mocked(api.post).mockResolvedValue(response({ limitPrice: 100.0, quantity: 0.1 }))

    await expect(
      placeLimitOrder(
        { market: 'CRYPTO', instrumentId: 1, side: 'BUY', limitPrice: '100', quantity: '0.1' },
        'key-1',
      ),
    ).resolves.toMatchObject({ orderId: 1 })
  })

  it('요청과 다른 값이 돌아오면 주문 상태 불명으로 던진다 — 성공으로 보여주면 안 된다', async () => {
    vi.mocked(api.post).mockResolvedValue(response({ limitPrice: 99, quantity: 0.1 }))

    const error = await placeLimitOrder(
      { market: 'CRYPTO', instrumentId: 1, side: 'BUY', limitPrice: '100', quantity: '0.1' },
      'key-1',
    ).catch((e: unknown) => e)

    expect(isOrderStateUnknown(error)).toBe(true)
    // 이 문구가 "알 수 없는 오류가 발생했습니다"의 유일한 출처였다.
    const message = toUserMessage(error)
    expect(message).not.toContain('알 수 없는 오류')
    expect(message).toContain('확인')
  })
})
