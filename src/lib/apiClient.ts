// 상대 경로 /api 기반 fetch 래퍼 — 에러 봉투 파싱, Bearer 부착, 401 단일 비행 토큰 갱신을 담당한다
import * as tokenStore from './tokenStore'
import type { ApiErrorEnvelope, TokenResponse } from '../services/types'

export class ApiError extends Error {
  readonly status: number
  /** 서버 error.code. 파싱 불가 시 'NETWORK_ERROR' | 'UNKNOWN' */
  readonly code: string
  /** 백엔드 한국어 message — 불안정 계약이라 화면 표시 금지, 로깅용 */
  readonly serverMessage: string | null
  readonly requestId: string | null

  constructor(
    status: number,
    code: string,
    serverMessage: string | null = null,
    requestId: string | null = null,
  ) {
    super(`${code} (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.serverMessage = serverMessage
    this.requestId = requestId
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** JSON.stringify 대상. undefined 면 본문·Content-Type 모두 없음 */
  body?: unknown
  /** undefined·null 값의 키는 쿼리에서 제외된다 */
  query?: Record<string, string | number | undefined | null>
  headers?: Record<string, string>
  /** 기본 true. false 면 Bearer 를 붙이지 않고 401 갱신도 하지 않는다 */
  auth?: boolean
  signal?: AbortSignal
}

/** 갱신을 시도하면 안 되는 경로 — refresh 자체와 로그인은 401 이 정상 응답이다 */
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login']

let refreshInFlight: Promise<string> | null = null

/**
 * 리프레시 토큰은 단일 사용 회전이라 동시에 두 번 호출하면 두 번째가 401 이 되어 로그아웃된다.
 * 그래서 모든 호출자가 같은 약속을 공유해야 한다. SSE 훅도 이 함수를 재사용한다.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  const refreshToken = tokenStore.getRefreshToken()
  if (!refreshToken) {
    tokenStore.clearSession()
    return Promise.reject(new ApiError(401, 'UNAUTHORIZED'))
  }

  refreshInFlight = fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, 'REFRESH_FAILED')
      const t = (await res.json()) as TokenResponse
      // 회전된 쌍을 즉시 함께 저장한다. 하나만 갱신하면 다음 갱신이 실패한다.
      tokenStore.setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken })
      return t.accessToken
    })
    .catch((e) => {
      // 세션을 비우면 AuthContext 가 'anonymous' 로 바뀌고 ProtectedRoute 가 /login 으로 보낸다.
      tokenStore.clearSession()
      throw e
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = `/api${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function decodeFailure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  try {
    const envelope = JSON.parse(text) as ApiErrorEnvelope
    if (envelope.error?.code) {
      return new ApiError(
        res.status,
        envelope.error.code,
        envelope.error.message ?? null,
        envelope.error.requestId ?? null,
      )
    }
  } catch {
    // 프록시 502·HTML 오류 페이지 등 봉투가 아닌 응답
  }
  return new ApiError(res.status, 'UNKNOWN')
}

async function decodeSuccess<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.status === 202 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

async function send<T>(path: string, options: RequestOptions, isRetry: boolean): Promise<T> {
  const { method = 'GET', body, query, headers = {}, auth = true, signal } = options

  const requestHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
  if (auth) {
    const token = tokenStore.getAccessToken()
    if (token) requestHeaders.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    // 취소는 호출부가 무시할 수 있게 그대로 던진다.
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK_ERROR')
  }

  if (res.ok) return decodeSuccess<T>(res)

  if (res.status === 401 && auth && !isRetry && !NO_REFRESH_PATHS.includes(path)) {
    await refreshAccessToken() // 실패하면 여기서 throw 되고 세션은 이미 정리된 상태다
    return send<T>(path, options, true) // 원 요청은 정확히 한 번만 재시도한다
  }

  throw await decodeFailure(res)
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return send<T>(path, options, false)
}

type BodylessOptions = Omit<RequestOptions, 'method' | 'body'>
type BodyOptions = Omit<RequestOptions, 'method'>

export const api = {
  get: <T>(path: string, o?: BodylessOptions) => apiRequest<T>(path, { ...o, method: 'GET' }),
  post: <T>(path: string, body?: unknown, o?: BodyOptions) =>
    apiRequest<T>(path, { ...o, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, o?: BodyOptions) =>
    apiRequest<T>(path, { ...o, method: 'PATCH', body }),
  // 'delete' 는 예약어라 del 로 둔다
  del: <T>(path: string, body?: unknown, o?: BodyOptions) =>
    apiRequest<T>(path, { ...o, method: 'DELETE', body }),
}
