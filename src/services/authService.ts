// 회원가입 3단계·로그인·회원정보 변경 등 /api/auth 엔드포인트를 감싸는 서비스
import { api } from '../lib/apiClient'
import type {
  EmailChangeRequest,
  EmailVerificationConfirmResponse,
  Member,
  NicknameChangeRequest,
  OAuthProvider,
  SignupRequest,
  TokenResponse,
} from './types'

/** 1단계 — 인증번호 발송 요청. 202. 로컬은 FakeEmailSender 라 백엔드 콘솔에만 코드가 찍힌다. */
export function requestEmailVerification(email: string): Promise<void> {
  return api.post<void>('/auth/email-verifications', { email }, { auth: false })
}

/** 2단계 — 6자리 코드 확인. 가입에 필요한 signupVerificationToken 을 받는다. */
export function confirmEmailVerification(
  email: string,
  code: string,
): Promise<EmailVerificationConfirmResponse> {
  return api.post<EmailVerificationConfirmResponse>(
    '/auth/email-verifications/confirm',
    { email, code },
    { auth: false },
  )
}

/** 3단계 — 201 + TokenResponse 이므로 응답을 저장하면 그대로 로그인 상태가 된다. */
export function signup(req: SignupRequest): Promise<TokenResponse> {
  return api.post<TokenResponse>('/auth/signup', req, { auth: false })
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return api.post<TokenResponse>('/auth/login', { email, password }, { auth: false })
}

/**
 * OAuth 콜백 코드 교환 — 프론트 콜백 라우트(`/oauth/:provider/callback`)가 받은 code·state를
 * 그대로 백엔드에 넘기면 이메일 로그인과 같은 TokenResponse를 받는다. code는 1회용이라 재호출 금지.
 * `oauth_state` 쿠키는 이 요청 경로가 백엔드 콜백 경로와 정확히 일치해 자동으로 실린다.
 *
 * **주의 — 이 경로는 프론트·API가 다른 오리진인 지금 배포에서 동작하지 않는다.** apiClient의 fetch가
 * `credentials: 'include'`를 쓰지 않아(finplay-api ADR-0022 §결정 2 — CORS allowCredentials=false) 이
 * 요청은 `oauth_state` 쿠키 없이 나가고 백엔드가 400 VALIDATION_ERROR로 거부한다. 실제 로그인 완료
 * 경로는 `exchangeLoginCode`다 — 백엔드가 LOGIN 콜백을 이제 여기로 직접 응답하지 않고 프론트
 * `/oauth/callback`으로 1회용 교환 코드를 실어 302 리다이렉트한다(finplay-api PR #385). 이 함수와
 * `OAuthCallback.tsx`(`/oauth/:provider/callback`)는 그 리다이렉트 이전 설계의 잔존 코드다.
 */
export function exchangeOAuthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<TokenResponse> {
  return api.get<TokenResponse>(`/auth/oauth/${provider}/callback`, {
    query: { code, state },
    auth: false,
  })
}

/**
 * 새 로그인 콜백 교환 — 백엔드가 카카오·네이버 LOGIN 콜백 성공 시 `/oauth/callback?code=`로
 * 리다이렉트하며 실어 보내는 1회용 코드를 실제 토큰으로 바꾼다(finplay-api PR #385,
 * `POST /api/auth/oauth/login-exchange`). 코드는 발급 후 60초 안에 한 번만 쓸 수 있다.
 */
export function exchangeLoginCode(code: string): Promise<TokenResponse> {
  return api.post<TokenResponse>('/auth/oauth/login-exchange', { code }, { auth: false })
}

export function logout(refreshToken: string): Promise<void> {
  return api.post<void>('/auth/logout', { refreshToken })
}

export function getMe(): Promise<Member> {
  return api.get<Member>('/auth/me')
}

export function changeNickname(req: NicknameChangeRequest): Promise<Member> {
  return api.patch<Member>('/auth/me/nickname', req)
}

/** 이메일 변경 1단계 — 새 이메일로 인증번호 발송. 202. */
export function requestEmailChange(req: EmailChangeRequest): Promise<void> {
  return api.post<void>('/auth/email-changes', req)
}

/**
 * 이메일 변경 2단계. 서버가 모든 리프레시 토큰을 폐기하므로
 * 호출부는 성공 후 반드시 tokenStore.clearSession() 을 해야 한다.
 */
export function confirmEmailChange(newEmail: string, code: string): Promise<Member> {
  return api.post<Member>('/auth/email-changes/confirm', { newEmail, code })
}
