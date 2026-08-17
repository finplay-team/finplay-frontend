// 로그인·가입 직후 어디로 보낼지 정하는 유틸 — 튜토리얼을 아직 시작하지 않은 사용자만 /tutorial로 보낸다
import { getPracticeProgress } from '../services/tutorialService'
import type { InvestmentPracticeResponse } from '../services/tutorialTypes'

/**
 * "이 시장을 실제로 시작했는가". 두 신호 중 하나면 시작한 것으로 본다 —
 * 완료했거나(COMPLETED), 이번 실행에서 종목을 골랐거나(attempt.instrumentId).
 *
 * status !== 'NOT_STARTED' 만으로는 안 된다. Tutorial 페이지가 마운트 즉시 ensurePracticeAttempt 로
 * attempt 를 만들고, 서버는 종목을 아직 고르지 않은 attempt 도 IN_PROGRESS 로 응답한다
 * (InvestmentPracticeQueryService.buildActiveAttemptResponse 의 instrument=null 분기).
 * 그래서 예전 기준으로는 튜토리얼 화면을 1초 열었다 닫기만 해도 그 사용자가 영원히 fallback 으로
 * 떨어졌다 — 아무것도 배우지 않은 사람과 실습을 끝낸 사람이 같은 취급을 받았다.
 * 백엔드 #427 이후 "열기만 한 attempt" 가 오히려 더 확실하게 IN_PROGRESS 로 보이므로 기준을
 * attempt 의 존재가 아니라 종목 선택으로 옮긴다.
 */
function hasStarted(result: PromiseSettledResult<InvestmentPracticeResponse>): boolean {
  if (result.status === 'rejected') return false // 조회 실패는 "시작 안 함"으로 본다(기존 동작)
  return result.value.status === 'COMPLETED' || result.value.attempt?.instrumentId != null
}

/**
 * 주식·코인 어느 쪽도 아직 시작하지 않았으면(또는 조회 자체가 실패하면) /tutorial 을, 아니면 원래
 * 목적지(fallback)를 돌려준다. 하나라도 진행했거나 완료한 사용자는 매번 다시 붙잡지 않는다 —
 * "튜토리얼은 언제든 건너뛸 수 있다"는 기존 방침은 그대로고, 바뀐 것은 "진행했다"의 정의뿐이다
 * (위 hasStarted 주석 참고).
 */
export async function resolvePostAuthPath(fallback: string): Promise<string> {
  const [stock, crypto] = await Promise.allSettled([
    getPracticeProgress('STOCK'),
    getPracticeProgress('CRYPTO'),
  ])
  return [stock, crypto].some(hasStarted) ? fallback : '/tutorial'
}
