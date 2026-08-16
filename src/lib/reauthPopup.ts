// 소셜(카카오·네이버) 재인증 팝업을 열고 완료될 때까지 기다려 reauthToken을 받아오는 헬퍼
import { requestReauthorize } from '../services/authService'
import type { OAuthProvider, SignupMethod } from '../services/types'

const POPUP_NAME = 'finplay-reauth'
const POPUP_FEATURES = 'width=480,height=640'
const CLOSED_POLL_MS = 500

export type ReauthMessage =
  | { type: 'REAUTH_SUCCESS'; reauthToken: string }
  | { type: 'REAUTH_FAILURE'; message: string }

/** 이메일 회원은 애초에 이 팝업을 열 대상이 아니다 — 호출부가 signupMethod로 먼저 걸러야 한다. */
export function providerFromSignupMethod(signupMethod: SignupMethod): OAuthProvider {
  if (signupMethod === 'EMAIL') {
    throw new Error('이메일 회원은 재인증 대상이 아닙니다.')
  }
  return signupMethod === 'KAKAO' ? 'kakao' : 'naver'
}

/**
 * 재인증 팝업을 열고 `/oauth/reauth-callback`(OAuthReauthCallback)이 postMessage로 돌려주는
 * reauthToken을 기다린다.
 *
 * 팝업은 클릭 이벤트 핸들러 안에서 **동기적으로** 먼저 연다 — `authorize` 호출(비동기)이 끝난 뒤에
 * 열면 브라우저가 사용자 제스처와의 연결을 잃어 팝업 차단기에 걸린다. 그래서 빈 창을 먼저 열고,
 * 인가 URL을 받으면 그 창의 주소만 바꾼다.
 */
export function openReauthPopup(provider: OAuthProvider): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open('about:blank', POPUP_NAME, POPUP_FEATURES)
    if (!popup) {
      reject(new Error('팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 시도해 주세요.'))
      return
    }

    let closedCheckTimer: number | undefined
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      if (closedCheckTimer !== undefined) window.clearInterval(closedCheckTimer)
    }

    const onMessage = (event: MessageEvent) => {
      // 팝업이 우리 프론트 오리진으로 돌아온 뒤에만 보내는 메시지다 — 다른 오리진은 무시한다.
      if (event.origin !== window.location.origin) return
      const data = event.data as ReauthMessage | undefined
      if (!data || (data.type !== 'REAUTH_SUCCESS' && data.type !== 'REAUTH_FAILURE')) return

      cleanup()
      popup.close()
      if (data.type === 'REAUTH_SUCCESS') {
        resolve(data.reauthToken)
      } else {
        reject(new Error(data.message))
      }
    }
    window.addEventListener('message', onMessage)

    // 팝업이 크로스 오리진(카카오·네이버)에 떠 있는 동안은 내부 이벤트를 걸 수 없어 polling으로만
    // "사용자가 완료 전에 직접 닫았다"를 감지할 수 있다.
    closedCheckTimer = window.setInterval(() => {
      if (popup.closed) {
        cleanup()
        reject(new Error('재인증 창이 닫혔습니다. 다시 시도해 주세요.'))
      }
    }, CLOSED_POLL_MS)

    requestReauthorize(provider)
      .then(({ authorizationUri }) => {
        popup.location.href = authorizationUri
      })
      .catch((err: unknown) => {
        cleanup()
        popup.close()
        reject(err instanceof Error ? err : new Error('재인증을 시작할 수 없습니다.'))
      })
  })
}
