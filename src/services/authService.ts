// 회원가입 3단계·로그인·회원정보 변경 등 /api/auth 엔드포인트를 감싸는 서비스
import { api } from '../lib/apiClient'
import type {
  EmailChangeRequest,
  EmailVerificationConfirmResponse,
  Member,
  NicknameChangeRequest,
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
