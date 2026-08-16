// 재인증 팝업이 카카오·네이버 인가 후 도착하는 콜백 라우트 — 교환 코드를 reauthToken으로 바꿔 오프너에 전달한다
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { exchangeReauthCode } from '../services/authService'
import { toUserMessage } from '../lib/errorMessages'
import type { ReauthMessage } from '../lib/reauthPopup'

export function OAuthReauthCallback() {
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  // StrictMode 에서 이펙트가 2번 도는데 code 는 1회용이라 두 번째 호출은 실패한다. ref 로 첫 실행만 통과시킨다.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const post = (message: ReauthMessage) => {
      // 오프너가 이미 닫혔거나(탭을 먼저 닫은 경우) 다른 오리진이면 opener가 null이거나 접근이 막힌다 —
      // 어느 쪽이든 이 팝업 화면에 오류를 보여주는 것으로 충분하다.
      window.opener?.postMessage(message, window.location.origin)
    }

    const code = params.get('code')
    if (!code) {
      const message = '잘못된 접근입니다. 재인증을 다시 시도해 주세요.'
      setError(message)
      post({ type: 'REAUTH_FAILURE', message })
      return
    }

    exchangeReauthCode(code)
      .then(({ reauthToken }) => {
        post({ type: 'REAUTH_SUCCESS', reauthToken })
        window.close()
      })
      .catch((err: unknown) => {
        const message = toUserMessage(err)
        setError(message)
        post({ type: 'REAUTH_FAILURE', message })
      })
  }, [params])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <p className="max-w-xs text-sm text-rose-300">{error}</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="text-sm font-medium text-brand hover:underline"
          >
            창 닫기
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">재인증 처리 중입니다…</p>
      )}
    </div>
  )
}
