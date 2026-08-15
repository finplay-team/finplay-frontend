// 카카오·네이버 OAuth 로그인 시작 버튼 — 클릭 시 인가 엔드포인트로 전체 페이지를 이동한다(302 흐름이라 fetch 불가)
import { API_BASE_URL } from '../lib/apiClient'
import type { OAuthProvider } from '../services/types'

const PROVIDERS: { id: OAuthProvider; label: string; className: string }[] = [
  { id: 'kakao', label: '카카오로 계속하기', className: 'bg-[#FEE500] text-[#391B1B]' },
  { id: 'naver', label: '네이버로 계속하기', className: 'bg-[#03C75A] text-white' },
]

function startOAuth(provider: OAuthProvider) {
  // fetch가 아니라 전체 페이지 이동이라 apiClient의 buildUrl을 못 거친다 — 여기서 직접 API_BASE_URL을 붙인다.
  // 이 뒤로는 백엔드가 카카오·네이버 인가 → LOGIN 콜백 성공까지 전부 처리하고, 마지막에 1회용 교환
  // 코드를 실어 프론트 `/oauth/callback`(OAuthLoginCallback)으로 302 리다이렉트한다(finplay-api PR #385).
  // 프론트가 그 코드로 실제 토큰을 받으므로 여기서 cross-origin 쿠키 문제를 신경 쓸 필요가 없다.
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
