// 로그인이 필요한 라우트를 보호하는 가드 컴포넌트 (관리자 개념 없음 — /api/auth/me 에 role 이 없다)
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // 'restoring' 도 통과시킨다 — 캐시된 member 로 즉시 그리고,
  // 토큰이 무효면 401 → clearSession 이후 이 가드가 다시 튕긴다.
  return <>{children}</>
}
