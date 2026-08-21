// 영속 attempt 기반 투자 실습의 진입·차트·관찰·복기·진행 API를 제공하는 서비스
import { api } from '../lib/apiClient'
import type { Market } from './types'
import type {
  InvestmentPracticeResponse,
  PracticeHoldingObservationResponse,
  PracticeHoldingReflectionResponse,
  PracticeAttemptResponse,
  PracticeOrderResponse,
  PracticeTutorialChartResponse,
} from './tutorialTypes'

/**
 * 3단계 가격 관찰 기록(append-only). 멱등키가 없다 — 호출마다 새 행이 쌓인다.
 * chain 재해석 실패는 409 PRACTICE_EVIDENCE_MISSING, 서버 유효 현재가 없음은 409 PRICE_UNAVAILABLE.
 */
export function recordHoldingObservation(
  holdingId: number,
): Promise<PracticeHoldingObservationResponse> {
  return api.post<PracticeHoldingObservationResponse>('/education/practice/holding-observations', {
    holdingId,
  })
}

/**
 * 3단계 자유 복기 저장 + 완료 확정(원자). evidence A·B 중 하나도 없으면 409 PRACTICE_EVIDENCE_MISSING,
 * 이미 완료면 409 PRACTICE_ALREADY_COMPLETED. 최초 호출만 성공하고 이후 재호출은 저장되지 않는다.
 */
export function saveHoldingReflection(
  holdingId: number,
  answer: string,
): Promise<PracticeHoldingReflectionResponse> {
  return api.post<PracticeHoldingReflectionResponse>('/education/practice/holding-reflections', {
    holdingId,
    answer,
  })
}

/**
 * holding 기반 진행 조회. market 필수 — 주식·코인은 완전히 독립된 튜토리얼(별도 tutorialKey)이라
 * 한쪽 조회가 다른 쪽 진행에 영향을 주지 않는다. 3차 MVP OCO 전용 진행조회(`/education/practice/oco`)와
 * URL·완료 key 를 공유하지 않으므로 절대 섞어 쓰면 안 된다.
 */
export function getPracticeProgress(market: Market): Promise<InvestmentPracticeResponse> {
  return api.get<InvestmentPracticeResponse>('/education/practice', { query: { market } })
}

export function ensurePracticeAttempt(market: Market): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}`)
}

export function selectPracticeInstrument(
  market: Market,
  instrumentId: number,
): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}/instrument`, {
    instrumentId,
  })
}

/**
 * 손절·익절 비율 지정(2026-08-21 재설계, 프리셋 선택을 대체한다). 자연 멱등이라 `Idempotency-Key`가
 * 필요 없다. 보유 중이면 409 `PRACTICE_STEP_LOCKED`로 거부된다 — 매수 전이거나 포지션을 정리한 뒤
 * (재진입 대기)에만 통한다. **(049 ORDERBASICS-015, 이슈 #507)** 대본을 쓰는 CRYPTO 실행은 시장가·
 * 지정가 왕복을 둘 다 마쳐야 한다 — 아직이면 409 `PRACTICE_STAGE_LOCKED`(이 판정이 보유 중 잠금보다
 * 앞선다).
 *
 * ⚠️ **두 값 모두 퍼센트 수의 양수다** — 3%는 `3`(`0.03` 아님)이고 **손절도 `-3`이 아니라 `3`으로
 * 보낸다**(서버가 −로 해석한다). 여기서 부호나 배율을 틀리면 100배·부호 반전이 조용히 난다.
 *
 * ⚠️ **숫자를 문자열로 만들어 보내지 않는다(특히 `toFixed`).** 서버는 소수 자릿수를 값이 아니라
 * **표기된 scale로** 판정한다 — `3.05`는 물론 값이 같은 `3.00`도 400이고, `3`과 `3.0`은 통과한다.
 * 지금은 JS `number`를 그대로 실어 `JSON.stringify`가 `3`으로 직렬화하므로 안전하다. 여기에
 * `toFixed(2)` 같은 걸 끼워 넣으면 멀쩡한 값이 거부된다(2026-08-21 백엔드 확인).
 *
 * 거부 코드(백엔드 확정) — 보유 중이거나 attempt 없음 409 `PRACTICE_STEP_LOCKED`, 2단계 왕복
 * 미완료 409 `PRACTICE_STAGE_LOCKED`(이 판정이 앞선다), 완료된 attempt 409
 * `PRACTICE_ALREADY_COMPLETED`, 범위 밖·소수 둘째 자리·키 누락 400 `VALIDATION_ERROR`.
 */
/**
 * ⚠️ **2026-08-21 재설계 이후 매수 폼에서는 이 경로를 부르지 않는다.** 손절·익절은 매수할 때 미리
 * 정하는 값이 아니라 **매수한 뒤 예약 매도로 직접 거는 것**이 되었고(제품 오너 지적: "매수는 지정가·
 * 시장가로 하고 매도할 때 예약매도로 손절·익절을 겪는 것"), 화면의 입력은
 * `createPracticeExitPlan`으로 옮겼다. 이 함수를 지우지 않는 이유는 **서버에 그대로 살아 있고**
 * "매수 전에 기준을 미리 정해 둔다"는 용도로는 여전히 유효한 계약이기 때문이다.
 */
export function updateExitRates(
  market: Market,
  stopLossRate: number,
  takeProfitRate: number,
): Promise<PracticeAttemptResponse> {
  return api.put<PracticeAttemptResponse>(`/education/practice/attempts/${market}/exit-rates`, {
    stopLossRate,
    takeProfitRate,
  })
}

/**
 * 지금 보유 중인 튜토리얼 종목에 **사용자가 직접** 손절·익절 예약을 건다(2026-08-21 재설계).
 * 매수 순간 서버가 자동으로 걸어 주던 것을 걷어내고 실전과 같은 순서 — 사고, 그다음 예약을 건다 —
 * 로 되돌린 것이 이 엔드포인트의 존재 이유다.
 *
 * ⚠️ **비율 규칙은 `updateExitRates`와 완전히 같다** — 퍼센트 수, 손절도 양수, 서버가 소수 자릿수를
 * 표기된 scale로 판정하므로 `toFixed` 계열로 문자열을 만들지 않는다. 범위는 화면이 하드코딩하지 않고
 * 진행 조회의 `exitRateBounds`에서 읽는다.
 *
 * 거부 코드(2026-08-21 백엔드 확정) — 보유 없음·attempt 없음·진행 중 아님 `PRACTICE_STEP_LOCKED`,
 * 2단계 대본 미완료 `PRACTICE_STAGE_LOCKED`, 이 매수분에 이미 걸었음(취소해도 소모된다)
 * `EXIT_PLAN_ALREADY_EXISTS`, 완료된 attempt `PRACTICE_ALREADY_COMPLETED`, 비율로 팔 가격을 만들 수
 * 없음 `EXIT_PLAN_INVALID_PRICE_RANGE`, 수량 부족 `INSUFFICIENT_QTY`, 비율 범위 위반 `VALIDATION_ERROR`.
 *
 * ⚠️ **화면은 서버 메시지를 그대로 보여주지 않는다** — `toUserMessage`는 `serverMessage`를 `console.warn`
 * 으로만 흘린다(백엔드 message는 불안정 계약이다). 위 코드의 문구는 `lib/errorMessages.ts`의
 * `PRACTICE_EXIT_PLAN_ERRORS`에 있고, 호출부는 `toUserMessage(error, PRACTICE_EXIT_PLAN_ERRORS)`로 쓴다.
 * 코드가 늘면 그 표를 같이 고친다 — 빠진 코드는 "요청을 처리할 수 없습니다."로 뭉개진다.
 *
 * 취소는 실전과 같은 `DELETE /api/exit-plans/{exitPlanId}`(`exitPlanService.cancelExitPlan`)를 쓴다.
 *
 * 응답 본문을 **일부러 쓰지 않는다**(`void`) — 예약의 정본은 진행 조회이고, 성공 뒤 그쪽을 다시 읽어
 * 그린다. 본문 모양을 여기서 추측해 타입으로 굳히면 백엔드가 확정할 때 두 곳이 어긋난다.
 */
export function createPracticeExitPlan(
  market: Market,
  stopLossRate: number,
  takeProfitRate: number,
): Promise<void> {
  return api.post<void>(`/education/practice/attempts/${market}/exit-plan`, {
    stopLossRate,
    takeProfitRate,
  })
}

export function restartPracticeAttempt(market: Market): Promise<PracticeAttemptResponse> {
  return api.post<PracticeAttemptResponse>(`/education/practice/attempts/${market}/restart`)
}

/**
 * 2단계(주문 방법 학습) 대본을 마친 실행을 같은 run 안에서 3단계(041 이야기) 대본으로 전환한다
 * (049 ORDERBASICS-018~021, 이슈 #507). `runNumber`·튜토리얼 계좌 현금·`exitPreset`은 바뀌지
 * 않는다 — 재시작이 아니다. **응답 시점에는 대본 커서가 아직 바뀌지 않는다** — 서버가 커서를
 * `null`로 되돌려 두고 다음 tick에서 3단계 첫 구간을 새로 연다. 호출부는 성공 직후 tick을
 * 한 번 더 불러야 새 `scenarioStage`(`ACT1` 등)를 받는다. 409 `PRACTICE_STAGE_LOCKED`(대본을
 * 쓰지 않는 실행·이미 3단계·시장가/지정가 왕복 미완료·보유 중).
 */
export function advancePracticeAttemptScript(market: Market): Promise<PracticeAttemptResponse> {
  return api.post<PracticeAttemptResponse>(`/education/practice/attempts/${market}/advance-script`)
}

export function getPracticeAttemptChart(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.get<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/chart`)
}

export function tickPracticeAttempt(market: Market): Promise<PracticeTutorialChartResponse> {
  return api.post<PracticeTutorialChartResponse>(`/education/practice/attempts/${market}/tick`)
}

/**
 * 튜토리얼 attempt 자기 주문 조회(435). /api/orders·/api/orders/pending 은 튜토리얼 샌드박스 종목
 * 주문을 걸러내므로(spec 033) 튜토리얼 화면의 주문 상태 폴링·복원은 이 엔드포인트를 써야 한다.
 */
export function getPracticeAttemptOrders(market: Market): Promise<PracticeOrderResponse[]> {
  return api.get<PracticeOrderResponse[]>(`/education/practice/attempts/${market}/orders`)
}
