// 카카오·네이버 OAuth 간편 로그인 버튼 묶음 (데모에서는 안내 메시지만 표시)
import { useState } from 'react'

interface Props {
  /** 버튼 문구 컨텍스트 — 로그인/가입 */
  mode: 'login' | 'signup'
  /** 상단 "또는" 구분선 표시 여부 (소셜이 최상단일 때는 숨김) */
  showDivider?: boolean
}

export function SocialLogin({ mode, showDivider = true }: Props) {
  const [notice, setNotice] = useState('')
  const suffix = mode === 'login' ? '계속하기' : '시작하기'

  const onClick = (provider: '카카오' | '네이버') => {
    setNotice(
      `${provider} 로그인은 데모 버전에서 준비 중입니다. 실서비스에서는 OAuth 2.0 인가코드 방식으로 연동됩니다.`,
    )
  }

  return (
    <div>
      {showDivider && (
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">
            또는 간편 {mode === 'login' ? '로그인' : '가입'}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => onClick('카카오')}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#FEE500] px-6 py-3 text-[15px] font-medium text-[#191919] transition-all duration-500 ease-spring hover:brightness-95 active:scale-[0.98]"
        >
          <KakaoMark />
          카카오로 {suffix}
        </button>
        <button
          type="button"
          onClick={() => onClick('네이버')}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#03C75A] px-6 py-3 text-[15px] font-medium text-white transition-all duration-500 ease-spring hover:brightness-95 active:scale-[0.98]"
        >
          <NaverMark />
          네이버로 {suffix}
        </button>
      </div>

      {notice && (
        <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
          {notice}
        </p>
      )}
    </div>
  )
}

/** 카카오 말풍선 심볼 (단색 인라인 SVG) */
function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3C6.98 3 3 6.19 3 10.11c0 2.5 1.63 4.7 4.1 5.97l-.84 3.12c-.07.28.24.5.48.34l3.72-2.47c.5.07 1.02.11 1.54.11 5.02 0 9-3.19 9-7.07S17.02 3 12 3Z" />
    </svg>
  )
}

/** 네이버 N 심볼 (단색 인라인 SVG) */
function NaverMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h5.2l5.5 8.1V4H20v16h-5.2l-5.5-8.1V20H4V4Z" />
    </svg>
  )
}
