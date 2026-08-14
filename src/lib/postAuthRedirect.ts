// 로그인·가입 직후 어디로 보낼지 정하는 유틸 — 튜토리얼을 아직 시작하지 않은 사용자만 /tutorial로 보낸다
import { getPracticeProgress } from '../services/tutorialService'

/**
 * 주식·코인 튜토리얼이 둘 다 NOT_STARTED(또는 조회 자체가 실패)면 /tutorial 을, 아니면 원래
 * 목적지(fallback)를 돌려준다. 하나라도 진행했거나 완료한 사용자는 매번 다시 붙잡지 않는다 —
 * "튜토리얼은 언제든 건너뛸 수 있다"는 기존 방침은 유지하고, 최초 진입 지점만 바꾼다.
 */
export async function resolvePostAuthPath(fallback: string): Promise<string> {
  const [stock, crypto] = await Promise.allSettled([
    getPracticeProgress('STOCK'),
    getPracticeProgress('CRYPTO'),
  ])
  const bothNotStarted = [stock, crypto].every(
    (r) => r.status === 'rejected' || r.value.status === 'NOT_STARTED',
  )
  return bothNotStarted ? '/tutorial' : fallback
}
