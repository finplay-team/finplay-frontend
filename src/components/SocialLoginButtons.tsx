// 카카오·네이버 OAuth 로그인 시작 버튼 — 클릭 시 인가 엔드포인트로 전체 페이지를 이동한다(302 흐름이라 fetch 불가)
import type { OAuthProvider } from '../services/types'

const PROVIDERS: { id: OAuthProvider; label: string; className: string }[] = [
  { id: 'kakao', label: '카카오로 계속하기', className: 'bg-[#FEE500] text-[#391B1B]' },
  { id: 'naver', label: '네이버로 계속하기', className: 'bg-[#03C75A] text-white' },
]

function startOAuth(provider: OAuthProvider) {
  window.location.href = `/api/auth/oauth/${provider}/authorize`
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
