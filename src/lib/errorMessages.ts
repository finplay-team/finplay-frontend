// 백엔드 error.code → 한국어 사용자 문구 매핑 + 서버가 코드를 줄 수 없는 자리를 메우는 클라이언트 에러 타입.
// 백엔드 message 는 불안정 계약이므로 code 로만 분기한다
import { ApiError } from './apiClient'

/**
 * **성공도 실패도 아닌 주문**을 나타내는 클라이언트 에러. 지금은 지정가 주문의 조용한 멱등 replay
 * (요청과 다른 limitPrice·quantity 가 돌아온 경우, services/orderService.placeLimitOrder)에서만 난다.
 *
 * ⚠️ **"주문이 실패했습니다"라고 단정하면 안 된다** — 주문이 서버에 들어갔을 수도 있는 자리다. 그래서
 * 맨 `Error` 가 아니라 판정 가능한 타입으로 올린다(`isOrderStateUnknown(e)` 또는 `e.code ===
 * 'ORDER_STATE_UNKNOWN'`). 화면은 이 경우를 성공·실패와 구분해 "주문 상태를 확인해 달라"고 말해야 한다.
 *
 * `message` 를 `'IDEMPOTENT_REPLAY_MISMATCH'` 로 그대로 두는 이유는 pages/Trade.tsx 가 아직 `e.message`
 * 로 이 경우를 잡고 있기 때문이다. 그쪽이 `isOrderStateUnknown` 으로 옮겨오면 message 는 자유다.
 */
export class OrderStateUnknownError extends Error {
  readonly code = 'ORDER_STATE_UNKNOWN'

  constructor() {
    super('IDEMPOTENT_REPLAY_MISMATCH')
    this.name = 'OrderStateUnknownError'
  }
}

export function isOrderStateUnknown(error: unknown): error is OrderStateUnknownError {
  return error instanceof OrderStateUnknownError
}

const MESSAGES: Record<string, string> = {
  // 공통
  NETWORK_ERROR: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  UNAUTHORIZED: '다시 로그인해 주세요.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',
  VALIDATION_ERROR: '입력값을 다시 확인해 주세요.',
  INTERNAL_ERROR: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
  // 클라이언트가 만든 코드 — OrderStateUnknownError 참고. 실패로 단정하지 않는 문구여야 한다.
  ORDER_STATE_UNKNOWN:
    '주문이 접수됐는지 확인되지 않았어요. 미체결 주문과 보유 수량을 확인한 뒤 다시 시도해 주세요.',
  // 인증·회원
  TOO_MANY_REQUESTS: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  DUPLICATE_RESOURCE: '이미 사용 중인 값입니다.',
  EMAIL_VERIFICATION_FAILED: '인증번호가 올바르지 않거나 만료되었습니다.',
  EMAIL_VERIFICATION_REQUIRED: '이메일 인증을 먼저 완료해 주세요.',
  REAUTHENTICATION_FAILED: '현재 비밀번호가 올바르지 않습니다.',
  // OAuth
  OAUTH_AUTHORIZATION_FAILED: '소셜 로그인 인증에 실패했습니다. 다시 시도해 주세요.',
  OAUTH_EMAIL_REQUIRED: '이메일 제공에 동의해야 로그인할 수 있습니다.',
  OAUTH_PROVIDER_ERROR: '소셜 로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.',
  ACCOUNT_LINK_REQUIRED: '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.',
  // 주문·시세
  MARKET_CLOSED: '장 시간이 아닙니다 (09:00~15:30).',
  PRICE_UNAVAILABLE: '현재 이 종목의 시세를 받을 수 없어 주문할 수 없습니다.',
  INSUFFICIENT_CASH: '주문 가능 현금이 부족합니다.',
  INSUFFICIENT_QTY: '보유 수량이 부족합니다.',
  // 실거래·튜토리얼 양쪽에서 뜨는 코드다 — "연습" 같은 튜토리얼 전용 단어를 쓰면 실거래 주문
  // 화면에서 거짓말이 된다. 중립적으로 쓰고, 화면별 사정은 override 로 덮는다(Trade.tsx).
  IDEMPOTENCY_CONFLICT: '주문이 겹쳐 처리하지 못했어요. 잠시 후 다시 눌러 주세요.',
  UNSUPPORTED_ORDER_TYPE: '지원하지 않는 주문 유형입니다.',
  MARKET_DATA_PROVIDER_ERROR: '가격 정보를 받아오지 못했어요. 잠시 후 다시 시도해 주세요.',
  INSTRUMENT_NOT_TRADABLE: '지금은 거래할 수 없는 종목입니다.',
  // 코인 실습 가상 가격 세션·지정가 (030) — 튜토리얼에서만 던지는 코드라 "연습"이라고 불러도 된다
  PRACTICE_PRICE_SESSION_ALREADY_ACTIVE: '이미 연습이 진행 중이에요. 화면을 새로고침해 주세요.',
  PRACTICE_PRICE_SESSION_CLOSED: '이 연습은 끝났어요. 처음부터 다시 시작해 주세요.',
  PRACTICE_PRICE_TICK_CONFLICT: '가격이 그새 움직였어요. 화면을 새로고침해 주세요.',
  PRACTICE_PRICE_SESSION_MISMATCH: '지금 연습 중인 종목이 아니에요. 화면을 새로고침해 주세요.',
  PRACTICE_LIMIT_ORDER_ALREADY_PENDING: '걸어 둔 주문이 아직 남아 있어요. 그 주문이 체결되거나 취소된 뒤에 다시 시도해 주세요.',
  // 튜토리얼 샘플 종목 4단계(매도) 5분 제한 (026·031 legacy 경로 + 039 attempt 경로 공통 — 둘 다 이
  // 코드를 던지므로 특정 화면의 버튼 이름(예: "처음부터 다시 시작")을 문구에 넣지 않는다)
  PRACTICE_SANDBOX_TIME_EXPIRED: '산 지 5분이 지나 이번 연습은 끝났어요. 처음부터 다시 해 주세요.',
  // 튜토리얼 실습 공통 (026·031·039)
  PRACTICE_ALREADY_COMPLETED: '이미 완료한 튜토리얼입니다.',
  PRACTICE_EVIDENCE_MISSING: '아직 다음 단계로 갈 수 없어요. 먼저 종목을 사고, 차트에서 가격을 한 번 확인해 주세요.',
  PRACTICE_STEP_LOCKED: '먼저 이전 단계를 완료해야 합니다. 화면을 새로고침해 진행 상황을 확인해 주세요.',
  // 049(이슈 #507) 2단계(주문 방법) 순서 강제 — 시장가·지정가 왕복, 2→3단계 전환 조건 미충족
  PRACTICE_STAGE_LOCKED: '먼저 앞 단계를 마쳐야 합니다. 화면의 체크리스트를 확인해 주세요.',
  // OCO 손절·익절 예약 (021 일반 리스크관리 OCO)
  EXIT_PLAN_ALREADY_EXISTS: '이미 이 종목에 걸어둔 예약이 있습니다. 취소한 뒤 다시 시도해 주세요.',
  EXIT_PLAN_NOT_FOUND: '예약을 찾을 수 없습니다.',
  EXIT_PLAN_NOT_PENDING: '이미 체결되거나 취소된 예약입니다. 화면을 새로고침해 주세요.',
  EXIT_PLAN_INVALID_PRICE_RANGE: '손절·익절 비율을 다시 확인해 주세요.',
}

/**
 * 튜토리얼 예약 매도 생성(`POST /education/practice/attempts/{market}/exit-plan`)이 돌려주는 코드들의
 * 화면 문구. 여기 있는 코드는 실거래 OCO·다른 단계와 **같은 이름이지만 뜻이 다르므로** 공용 문구를
 * 그대로 쓰면 거짓말이 된다(대표적으로 `EXIT_PLAN_ALREADY_EXISTS` 는 실거래에선 "취소하고 다시",
 * 튜토리얼에선 한 진입에 한 번뿐이라 취소해도 다시 걸 수 없다).
 *
 * 호출부는 `toUserMessage(error, PRACTICE_EXIT_PLAN_ERRORS)` 로 쓴다.
 */
export const PRACTICE_EXIT_PLAN_ERRORS: Record<string, string> = {
  PRACTICE_STEP_LOCKED:
    '아직 예약을 걸 수 없어요. 예약 매도는 종목을 산 뒤에 걸 수 있으니, 먼저 매수를 마쳐 주세요.',
  PRACTICE_STAGE_LOCKED:
    '주문 방법을 익히는 단계를 먼저 마쳐야 해요. 시장가와 지정가로 한 번씩 사고팔면 예약을 걸 수 있습니다.',
  PRACTICE_ALREADY_COMPLETED:
    '이미 끝난 연습이라 예약을 걸 수 없어요. 처음부터 다시 시작하면 예약도 다시 해 볼 수 있습니다.',
  EXIT_PLAN_ALREADY_EXISTS:
    '이 매수분에는 예약을 다시 걸 수 없어요. 예약은 한 번 산 것에 한 번만 걸 수 있고 취소해도 되살아나지 않습니다 — 지금 가진 것을 팔고 다시 사면 새로 걸 수 있어요.',
  EXIT_PLAN_INVALID_PRICE_RANGE:
    '그 비율로는 팔 가격을 만들 수 없어요. 손절과 익절 비율을 조금 더 벌려서 다시 입력해 주세요.',
  INSUFFICIENT_QTY:
    '가진 수량이 모자라 예약을 걸 수 없어요. 남은 수량을 확인하고, 방금 판 것이 있다면 화면을 새로고침해 주세요.',
  VALIDATION_ERROR:
    '손절·익절 비율이 입력할 수 있는 범위를 벗어났어요. 입력창에 적힌 범위 안의 숫자로 다시 넣어 주세요.',
}

/** 화면별 문구가 필요할 때 override 를 앞세운다. */
export function toUserMessage(error: unknown, override?: Record<string, string>): string {
  // 서버가 준 코드가 아니라 우리가 만든 코드다 — ApiError 분기보다 먼저 잡아야 UNKNOWN 으로 뭉개지지 않는다.
  if (isOrderStateUnknown(error)) {
    return override?.[error.code] ?? MESSAGES[error.code]
  }

  if (!(error instanceof ApiError)) {
    return MESSAGES.UNKNOWN
  }

  // 서버 message 는 화면에 쓰지 않지만 디버깅에는 필요하다.
  if (error.serverMessage || error.requestId) {
    console.warn(`[api] ${error.code} requestId=${error.requestId ?? '-'} ${error.serverMessage ?? ''}`)
  }

  const fromOverride = override?.[error.code]
  if (fromOverride) return fromOverride

  // 'UNKNOWN' 은 서버가 준 코드가 아니라 **봉투를 못 읽었다**는 apiClient 의 표시다(프록시 502·HTML
  // 오류 페이지 등). MESSAGES 에 같은 키가 있어 그대로 조회하면 상태 코드를 보기도 전에
  // "알 수 없는 오류"로 끝나 버린다 — 그래서 여기서만 표를 건너뛰고 status 로 판단한다.
  const known = error.code === 'UNKNOWN' ? undefined : MESSAGES[error.code]
  if (known) return known

  // 백엔드가 안 떠 있으면 dev 프록시·게이트웨이가 502·503·504 를 준다. 서버 내부 오류가 아니라 못 닿은 것이다.
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return MESSAGES.NETWORK_ERROR
  }
  if (error.status >= 500) return MESSAGES.INTERNAL_ERROR
  if (error.status >= 400) return '요청을 처리할 수 없습니다.'
  return MESSAGES.UNKNOWN
}

export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}
