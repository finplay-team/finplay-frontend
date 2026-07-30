// 로그인 세션 상태를 전역에서 공유하는 인증 Context Provider
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authService } from '../services/authService'
import type { SessionUser, SignupPayload } from '../services/types'

interface AuthContextValue {
  user: SessionUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (payload: SignupPayload) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => authService.getSession())

  const login = useCallback(async (email: string, password: string) => {
    const next = await authService.login(email, password)
    setUser(next)
  }, [])

  const signup = useCallback(async (payload: SignupPayload) => {
    const next = await authService.signup(payload)
    setUser(next)
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'ADMIN',
      login,
      signup,
      logout,
    }),
    [user, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
