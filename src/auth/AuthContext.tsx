// 토큰 스토어를 구독해 로그인 상태·회원 정보를 전역에 공급하는 인증 Context Provider
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ApiError } from '../lib/apiClient'
import * as tokenStore from '../lib/tokenStore'
import { invalidateInstrumentCache } from '../services/instrumentService'
import * as authService from '../services/authService'
import type { Member, OAuthProvider, SignupRequest } from '../services/types'

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: AuthStatus
  /** isAdmin 은 없다 — /api/auth/me 에 role 이 없어 클라이언트 관리자 개념이 불가능하다. */
  member: Member | null
  login: (email: string, password: string) => Promise<void>
  loginWithOAuth: (provider: OAuthProvider, code: string, state: string) => Promise<void>
  signupWithToken: (req: SignupRequest) => Promise<void>
  logout: () => Promise<void>
  refreshMember: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const snap = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot)
  const [validated, setValidated] = useState(false)

  const status: AuthStatus = !snap.accessToken
    ? 'anonymous'
    : validated
      ? 'authenticated'
      : 'restoring'

  // 부팅 시 /me 로 토큰을 검증하면서 회원 캐시를 갱신한다. 실패하면 401 경로가 세션을 비운다.
  useEffect(() => {
    if (!snap.accessToken || validated) return
    let cancelled = false // StrictMode 의 이펙트 2회 실행 방어
    authService
      .getMe()
      .then((m) => {
        if (cancelled) return
        tokenStore.setCachedMember(m)
        setValidated(true)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 갱신에 성공했는데도 /me 가 여전히 401 이면(회원 삭제 등) 세션을 비워야 한다.
        // 비우지 않으면 accessToken 이 회전될 때마다 이 이펙트가 다시 돌아 갱신 루프가 된다.
        if (e instanceof ApiError && e.status === 401) tokenStore.clearSession()
        // 그 밖의 실패(네트워크 등)는 캐시된 member 로 계속 그리고 다음 요청에서 다시 판단한다.
      })
    return () => {
      cancelled = true
    }
  }, [snap.accessToken, validated])

  const login = useCallback(async (email: string, password: string) => {
    const t = await authService.login(email, password)
    tokenStore.setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken })
    const m = await authService.getMe()
    tokenStore.setCachedMember(m)
    setValidated(true)
  }, [])

  const loginWithOAuth = useCallback(
    async (provider: OAuthProvider, code: string, state: string) => {
      const t = await authService.exchangeOAuthCallback(provider, code, state)
      tokenStore.setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken })
      const m = await authService.getMe()
      tokenStore.setCachedMember(m)
      setValidated(true)
    },
    [],
  )

  const signupWithToken = useCallback(async (req: SignupRequest) => {
    // 가입 응답이 201 + TokenResponse 라 별도 로그인 호출이 필요 없다.
    const t = await authService.signup(req)
    tokenStore.setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken })
    const m = await authService.getMe()
    tokenStore.setCachedMember(m)
    setValidated(true)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken()
    if (refreshToken) {
      await authService.logout(refreshToken).catch(() => {
        // 서버 폐기 실패해도 로컬 세션은 반드시 비운다.
      })
    }
    invalidateInstrumentCache()
    setValidated(false)
    tokenStore.clearSession()
  }, [])

  const refreshMember = useCallback(async () => {
    const m = await authService.getMe()
    tokenStore.setCachedMember(m)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      member: snap.member,
      login,
      loginWithOAuth,
      signupWithToken,
      logout,
      refreshMember,
    }),
    [status, snap.member, login, loginWithOAuth, signupWithToken, logout, refreshMember],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
