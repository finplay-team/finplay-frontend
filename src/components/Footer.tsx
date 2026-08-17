// 서비스 고지(모의투자·종목 비추천)와 네비게이션을 담은 하단 푸터
import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-line bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-brand-ink">
                f
              </span>
              <span className="font-display text-lg font-semibold tracking-tight">FinPlay</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              가상 자산으로 주식과 코인 매매를 연습하는 교육형 모의투자 플랫폼. 주식은 과거
              거래일의 1분봉을 재생하고, 코인은 빗썸 실시간 시세를 씁니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="서비스"
              items={[
                { label: '홈', to: '/' },
                { label: '고객센터', to: '/support' },
              ]}
            />
            <FooterCol
              title="계정"
              items={[
                { label: '로그인', to: '/login' },
                { label: '회원가입', to: '/signup' },
              ]}
            />
            <FooterCol title="문서" items={[{ label: '기술 스택', to: '/#tech' }]} />
          </div>
        </div>

        <div className="mt-14 rounded-2xl border border-line bg-white/[0.03] p-5">
          <p className="text-xs leading-relaxed text-muted">
            <span className="font-medium text-ink">투자 유의 안내.</span> 본 서비스는 가상 자산을
            이용한 모의투자 교육 도구입니다. 실제 매매가 이루어지지 않으며, 어떤 종목의 매수·매도도
            권유하거나 추천하지 않습니다. 시세는 학습 목적의 참고 데이터입니다.
          </p>
        </div>

        <p className="mt-8 text-xs text-muted/70">© 2026 FinPlay. 교육용 프로토타입.</p>
      </div>
    </footer>
  )
}

function FooterCol({
  title,
  items,
}: {
  title: string
  items: { label: string; to: string }[]
}) {
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-eyebrow text-muted">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i.label}>
            <Link
              to={i.to}
              className="text-sm text-ink/80 transition-colors duration-300 hover:text-brand"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
