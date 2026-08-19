// 튜토리얼 화면에 어떤 시장을 노출할지 정하는 정책 한 곳 — 주식 입구를 임시로 닫아 둔 스위치가 여기 있다
import type { InvestmentPracticeResponse } from '../services/tutorialTypes'
import type { Market } from '../services/types'

/**
 * 주식 튜토리얼 입구를 열지 여부. **지금은 닫혀 있다(백엔드 이슈 #478).**
 *
 * 코인 튜토리얼만 사건이 있는 4막 대본으로 넘어갔고 주식은 아직 옛 방식(무작위 가격 + 매수 후 5분
 * 제한)이라, 같은 화면에서 두 시장의 경험이 갈리는 걸 사용자에게 보이지 않으려고 입구만 가렸다.
 * 백엔드 API는 그대로 열려 있다 — 직접 호출하면 옛 방식 튜토리얼에 들어갈 수 있고, 그건 "되돌리기
 * 쉬움"을 사기 위해 감수한 대가다.
 *
 * **되돌리는 방법**: 주식 대본이 들어오면 이 상수를 `true`로 바꾸면 된다. 그 외에 지울 코드는 없다.
 * 함께 되돌릴 것 — `pages/Tutorial.tsx`의 기본 시장(지금은 CRYPTO)과 헤더 문구(주식은 매수 후 5분
 * 제한이 남아 있으므로 그 설명이 다시 필요하다), `components/tutorial/AttemptTutorialFlow.tsx`의
 * TOUR_SELL 문구.
 */
export const STOCK_TUTORIAL_ENTRY_OPEN = false

/**
 * "이 시장 튜토리얼을 실제로 시작했는가". 완료했거나(COMPLETED) 이번 실행에서 종목을 골랐으면
 * (attempt.instrumentId) 시작한 것으로 본다.
 *
 * `status !== 'NOT_STARTED'` 로 판단하면 안 된다 — Tutorial 페이지가 마운트 즉시
 * ensurePracticeAttempt 로 attempt 를 만들고 서버는 종목을 고르지 않은 attempt 도 IN_PROGRESS 로
 * 응답하므로, 화면을 1초 열었다 닫기만 한 사용자까지 "진행 중"이 된다. 입구를 닫는 판단에 이 기준을
 * 쓰면 거의 모든 기존 사용자에게 주식 탭이 계속 보여 가리는 의미가 없어진다.
 */
export function hasStartedPractice(progress: InvestmentPracticeResponse | null | undefined): boolean {
  if (!progress) return false
  return progress.status === 'COMPLETED' || progress.attempt?.instrumentId != null
}

/**
 * 튜토리얼 화면의 시장 탭에 실제로 그릴 시장 목록.
 *
 * 입구가 닫혀 있어도 **이미 주식을 진행 중인 사용자에게는 탭을 남긴다** — 입구만 지우면 하던 실행이
 * 같이 가려져 빠져나올 길이 사라진다. 지금 보고 있는 시장도 항상 남긴다(재시작으로 instrumentId 가
 * null 이 되는 순간 보고 있던 탭이 사라지는 것을 막는다).
 */
export function visibleTutorialMarkets(
  current: Market,
  stockProgress: InvestmentPracticeResponse | null | undefined,
): Market[] {
  const showStock =
    STOCK_TUTORIAL_ENTRY_OPEN || current === 'STOCK' || hasStartedPractice(stockProgress)
  return showStock ? ['CRYPTO', 'STOCK'] : ['CRYPTO']
}
