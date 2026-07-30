// 백엔드 error.code → 한국어 사용자 문구 매핑. 백엔드 message 는 불안정 계약이므로 code 로만 분기한다
import { ApiError } from './apiClient'

const MESSAGES: Record<string, string> = {
  // 공통
  NETWORK_ERROR: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  UNAUTHORIZED: '다시 로그인해 주세요.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',
  VALIDATION_ERROR: '입력값을 다시 확인해 주세요.',
  INTERNAL_ERROR: '서버에 문제가 발생했습니다.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
  // 인증·회원
  TOO_MANY_REQUESTS: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  DUPLICATE_RESOURCE: '이미 사용 중인 값입니다.',
  EMAIL_VERIFICATION_FAILED: '인증번호가 올바르지 않거나 만료되었습니다.',
  EMAIL_VERIFICATION_REQUIRED: '이메일 인증을 먼저 완료해 주세요.',
  REAUTHENTICATION_FAILED: '현재 비밀번호가 올바르지 않습니다.',
  // 주문·시세
  MARKET_CLOSED: '장 시간이 아닙니다 (09:00~15:30).',
  PRICE_UNAVAILABLE: '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.',
  INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다.',
  INSUFFICIENT_QTY: '보유 수량이 부족합니다.',
  IDEMPOTENCY_CONFLICT: '이전 주문과 내용이 충돌했습니다. 다시 시도해 주세요.',
  UNSUPPORTED_ORDER_TYPE: '지원하지 않는 주문 유형입니다.',
  MARKET_DATA_PROVIDER_ERROR: '시세 공급자에 일시적인 문제가 있습니다.',
}

/** 화면별 문구가 필요할 때 override 를 앞세운다. */
export function toUserMessage(error: unknown, override?: Record<string, string>): string {
  if (!(error instanceof ApiError)) {
    return MESSAGES.UNKNOWN
  }

  // 서버 message 는 화면에 쓰지 않지만 디버깅에는 필요하다.
  if (error.serverMessage || error.requestId) {
    console.warn(`[api] ${error.code} requestId=${error.requestId ?? '-'} ${error.serverMessage ?? ''}`)
  }

  const fromOverride = override?.[error.code]
  if (fromOverride) return fromOverride

  const known = MESSAGES[error.code]
  if (known) return known

  if (error.status >= 500) return MESSAGES.INTERNAL_ERROR
  if (error.status >= 400) return '요청을 처리할 수 없습니다.'
  return MESSAGES.UNKNOWN
}

export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}
