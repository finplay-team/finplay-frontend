// 랜딩 최하단 전환 CTA — 가입 유도 배너
import { LinkButton } from '../ui/Button'
import { Reveal } from '../ui/Reveal'

export function CTA() {
  return (
    <section className="px-4 py-20 md:py-28">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-bezel border border-white/[0.08] bg-surface px-6 py-20 text-center shadow-glow-lg md:py-28">
          <div aria-hidden className="orb -left-20 -top-20 h-72 w-72" />
          <div aria-hidden className="orb -bottom-24 -right-16 h-72 w-72" />
          <div className="relative">
            <div className="flex justify-center">
              <span className="eyebrow">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                지금 바로, 무료로
              </span>
            </div>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight text-ink md:text-6xl">
              1,000만원으로
              <br />
              오늘 첫 기록을 남기세요
            </h2>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted">
              가입하면 주식·코인 계좌가 함께 생성되고 계좌마다 가상 시드머니 1,000만원이
              지급됩니다. 실전이 아니니 마음껏 시험해 보세요.
            </p>
            <div className="mt-9 flex justify-center">
              <LinkButton to="/signup" size="lg" withIcon>
                무료로 시작하기
              </LinkButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
