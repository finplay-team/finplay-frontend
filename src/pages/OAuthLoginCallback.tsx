// 백엔드가 카카오·네이버 LOGIN 콜백 성공 후 1회용 교환 코드를 실어 리다이렉트하는 콜백 라우트 — code를 실제 토큰으로 바꿔 로그인을 마무리한다
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { toUserMessage } from '../lib/errorMessages'
import { resolvePostAuthPath } from '../lib/postAuthRedirect'

export function OAuthLoginCallback() {
  const [params] = useSearchParams()
  const { loginWithOAuthCode } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  // StrictMode 에서 이펙트가 2번 도는데 code 는 1회용이라 두 번째 호출은 실패한다. ref 로 첫 실행만 통과시킨다.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    if (!code) {
      setError('잘못된 접근입니다. 로그인 화면에서 다시 시도해 주세요.')
      return
    }

    loginWithOAuthCode(code)
      // 카카오·네이버로 처음 가입한 사람도 진행 상태만으로 판별해 튜토리얼로 먼저 보낸다.
      .then(() => resolvePostAuthPath('/trade'))
      .then((path) => navigate(path, { replace: true }))
      .catch((err: unknown) => {
        setError(
          toUserMessage(err, {
            // 백엔드는 만료·이미 소비됨·형식 오류를 구분하지 않고 전부 VALIDATION_ERROR다.
            VALIDATION_ERROR: '로그인 코드가 만료되었거나 이미 사용됐습니다. 로그인 화면에서 다시 시도해 주세요.',
          }),
        )
      })
  }, [params, loginWithOAuthCode, navigate])

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
