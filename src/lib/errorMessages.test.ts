// "알 수 없는 오류가 발생했습니다"가 새어 나오면 안 되는 자리(주문 상태 불명·백엔드 미기동·예약 거부)를 고정한다
import { describe, expect, it } from 'vitest'
import { ApiError } from './apiClient'
import {
  OrderStateUnknownError,
  PRACTICE_EXIT_PLAN_ERRORS,
  isOrderStateUnknown,
  toUserMessage,
} from './errorMessages'

describe('주문 상태 불명(OrderStateUnknownError)', () => {
  it('맨 Error가 아니라 판정 가능한 타입·코드로 온다', () => {
    const error = new OrderStateUnknownError()

    expect(isOrderStateUnknown(error)).toBe(true)
    expect(error.code).toBe('ORDER_STATE_UNKNOWN')
    // pages/Trade.tsx가 아직 message로 판정하고 있어 이 문자열은 계약이다.
    expect(error.message).toBe('IDEMPOTENT_REPLAY_MISMATCH')
    expect(isOrderStateUnknown(new Error('IDEMPOTENT_REPLAY_MISMATCH'))).toBe(false)
  })

  it('"알 수 없는 오류"가 아니라 주문 상태를 확인하라고 말한다 — 실패로 단정하지 않는다', () => {
    const message = toUserMessage(new OrderStateUnknownError())

    expect(message).not.toContain('알 수 없는 오류')
    expect(message).toContain('확인')
    expect(message).not.toContain('실패')
  })

  it('화면별 override로 덮을 수 있다', () => {
    const message = toUserMessage(new OrderStateUnknownError(), {
      ORDER_STATE_UNKNOWN: '연습 주문이 들어갔는지 확인 중이에요.',
    })

    expect(message).toBe('연습 주문이 들어갔는지 확인 중이에요.')
  })
})

describe('백엔드에 닿지 못한 응답', () => {
  it('fetch 자체가 실패하면 서버에 연결할 수 없다고 말한다', () => {
    expect(toUserMessage(new ApiError(0, 'NETWORK_ERROR'))).toContain('서버에 연결할 수 없습니다')
  })

  it('봉투를 못 읽은 502·503·504(백엔드 미기동)도 "알 수 없는 오류"로 뭉개지 않는다', () => {
    for (const status of [502, 503, 504]) {
      const message = toUserMessage(new ApiError(status, 'UNKNOWN'))
      expect(message).toContain('서버에 연결할 수 없습니다')
    }
  })

  it('그 밖의 5xx는 서버 문제로 갈라진다', () => {
    expect(toUserMessage(new ApiError(500, 'UNKNOWN'))).toContain('서버에 문제가 발생했습니다')
  })
})

describe('튜토리얼 예약 매도 거부 코드', () => {
  const codes = [
    'PRACTICE_STEP_LOCKED',
    'PRACTICE_STAGE_LOCKED',
    'PRACTICE_ALREADY_COMPLETED',
    'EXIT_PLAN_ALREADY_EXISTS',
    'EXIT_PLAN_INVALID_PRICE_RANGE',
    'INSUFFICIENT_QTY',
    'VALIDATION_ERROR',
  ]

  it('백엔드가 확정한 코드가 하나도 빠짐없이 문구를 갖는다', () => {
    for (const code of codes) {
      const message = toUserMessage(new ApiError(409, code), PRACTICE_EXIT_PLAN_ERRORS)
      expect(message).toBe(PRACTICE_EXIT_PLAN_ERRORS[code])
      // 표에서 빠지면 여기로 뭉개진다 — 그게 이 파일이 막는 회귀다.
      expect(message).not.toBe('요청을 처리할 수 없습니다.')
    }
  })

  it('EXIT_PLAN_ALREADY_EXISTS는 "취소하고 다시"라고 거짓말하지 않고 다음 행동을 알려 준다', () => {
    const message = toUserMessage(new ApiError(409, 'EXIT_PLAN_ALREADY_EXISTS'), PRACTICE_EXIT_PLAN_ERRORS)

    expect(message).toContain('팔고 다시 사면')
    expect(message).not.toContain('취소한 뒤 다시 시도')
  })

  it('override를 안 쓰는 실거래 OCO 문구는 그대로다', () => {
    expect(toUserMessage(new ApiError(409, 'EXIT_PLAN_ALREADY_EXISTS'))).toBe(
      '이미 이 종목에 걸어둔 예약이 있습니다. 취소한 뒤 다시 시도해 주세요.',
    )
  })
})
