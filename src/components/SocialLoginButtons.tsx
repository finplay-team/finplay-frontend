// 카카오·네이버 OAuth 로그인 시작 버튼 — 클릭 시 인가 엔드포인트로 전체 페이지를 이동한다(302 흐름이라 fetch 불가)
import { API_BASE_URL } from '../lib/apiClient'
import type { OAuthProvider } from '../services/types'

const PROVIDERS: { id: OAuthProvider; label: string; className: string }[] = [
  { id: 'kakao', label: '카카오로 계속하기', className: 'bg-[#FEE500] text-[#391B1B]' },
  { id: 'naver', label: '네이버로 계속하기', className: 'bg-[#03C75A] text-white' },
]

function startOAuth(provider: OAuthProvider) {
  // fetch가 아니라 전체 페이지 이동이라 apiClient의 buildUrl을 못 거친다 — 여기서 직접 API_BASE_URL을 붙인다.
  // 절대주소로 고쳐도 로그인이 완전히 되지는 않는다: 프론트와 API가 다른 오리진이면(S3 단독 단계)
  // oauth_state 쿠키(SameSite=Lax)가 콜백 fetch에 실리지 않아 백엔드가 400 VALIDATION_ERROR로
  // 거부한다 — OAuthCallback.tsx가 이미 안전하게 처리하지만(크래시 없이 안내 문구), 실제 로그인 성공은
  // 프론트와 API가 same-site가 되는 단계(finplay-api ADR-0022 §결정 4)까지 보류된다.
  window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}/authorize`
}

export function SocialLoginButtons() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        또는
        <span className="h-px flex-1 bg-line" />
      </div>
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => startOAuth(p.id)}
          className={`flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition-opacity hover:opacity-90 ${p.className}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
