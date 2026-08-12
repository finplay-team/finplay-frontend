// 카카오·네이버 OAuth 인가 완료 후 도착하는 콜백 라우트 — code·state를 백엔드로 넘겨 로그인을 마무리한다
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { toUserMessage } from '../lib/errorMessages'
import type { OAuthProvider } from '../services/types'

const PROVIDER_LABEL: Record<OAuthProvider, string> = { kakao: '카카오', naver: '네이버' }

function isOAuthProvider(v: string | undefined): v is OAuthProvider {
  return v === 'kakao' || v === 'naver'
}

export function OAuthCallback() {
  const { provider } = useParams<{ provider: string }>()
  const [params] = useSearchParams()
  const { loginWithOAuth } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  // StrictMode 에서 이펙트가 2번 도는데 code 는 1회용이라 두 번째 호출은 실패한다. ref 로 첫 실행만 통과시킨다.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    if (!isOAuthProvider(provider)) {
      setError('지원하지 않는 로그인 방식입니다.')
      return
    }
    const label = PROVIDER_LABEL[provider]
    const oauthError = params.get('error')
    const code = params.get('code')
    const state = params.get('state')

    if (oauthError) {
      setError(`${label} 인증이 취소되었습니다.`)
      return
    }
    if (!code || !state) {
      setError('잘못된 접근입니다. 로그인 화면에서 다시 시도해 주세요.')
      return
    }

    loginWithOAuth(provider, code, state)
      .then(() => navigate('/trade', { replace: true }))
      .catch((err: unknown) => {
        setError(
          toUserMessage(err, {
            OAUTH_EMAIL_REQUIRED: `${label} 계정에서 이메일 제공에 동의해야 로그인할 수 있습니다.`,
            ACCOUNT_LINK_REQUIRED: '이미 이메일로 가입된 계정입니다. 이메일로 로그인해 주세요.',
            OAUTH_AUTHORIZATION_FAILED: `${label} 인증에 실패했습니다. 다시 시도해 주세요.`,
          }),
        )
      })
  }, [provider, params, loginWithOAuth, navigate])

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-xs text-sm text-rose-300">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="text-sm font-medium text-brand hover:underline"
        >
          로그인 화면으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 text-center text-sm text-muted">
      로그인 처리 중입니다…
    </div>
  )
}
