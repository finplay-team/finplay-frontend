// 랜딩 최하단 전환 CTA — 가입 유도 배너
import { LinkButton } from '../ui/Button'
import { Reveal } from '../ui/Reveal'

export function CTA() {
  return (
    <section className="px-4 py-24 md:py-32">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-bezel bg-ink px-6 py-20 text-center md:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-coin/20 blur-3xl"
          />
          <div className="relative">
            <div className="flex justify-center">
              <span className="eyebrow border-white/10 bg-white/10 text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                지금 바로, 무료로
              </span>
            </div>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
              1,000만원으로
              <br />
              오늘 첫 기록을 남기세요
            </h2>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-white/60">
              가입하면 주식·코인 계좌가 각각 생성되고 시드머니가 지급됩니다. 실전이 아니니 마음껏
              시험해 보세요.
            </p>
            <div className="mt-9 flex justify-center">
              <LinkButton to="/signup" size="lg" variant="soft" withIcon>
                무료로 시작하기
              </LinkButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
