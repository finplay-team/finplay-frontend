// 주식·코인 두 튜토리얼 다 미완료인 사용자를 /tutorial 로 강제 이동시키는 가드
// ProtectedRoute 안쪽에 감싸 쓴다 — 인증 여부는 ProtectedRoute 가 먼저 처리한다는 전제다.
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTutorialGate } from '../hooks/useTutorialProgress'

export function RequireTutorial({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { loading, mustComplete } = useTutorialGate()

  // 조회 중 빈 화면이 낫다 — 이미 완료한 사용자를 잠깐이라도 /tutorial 로 튕기면 깜빡임으로 보인다.
  if (loading) return null
  if (mustComplete && location.pathname !== '/tutorial') {
    return <Navigate to="/tutorial" replace />
  }
  return <>{children}</>
}
