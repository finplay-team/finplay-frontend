// "랭킹 ≠ 좋은 투자자" — 실현손익 랭킹과 미실현 포함 AI 리포트의 의도적 불일치 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Trophy, Sparkle } from '../ui/icons'
import { LinkButton } from '../ui/Button'

export function RankingPhilosophy() {
  return (
    <section className="px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal className="order-2 space-y-4 lg:order-1">
            <Card accent="brand">
              <div className="p-6">
                <div className="flex items-center gap-2 text-ink">
                  <Trophy width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-eyebrow">랭킹 기준</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  <span className="font-semibold text-ink">실현손익</span>만 집계합니다. 매도로
                  확정한 손익 기준이라, 오른 종목은 팔고 물린 종목은 버티는 전략이 순위에 유리하게
                  작용할 수 있습니다.
                </p>
              </div>
            </Card>
            <Card>
              <div className="p-6">
                <div className="flex items-center gap-2 text-brand">
                  <Sparkle width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-eyebrow">AI 리포트 기준</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink/85">
                  <span className="font-semibold text-ink">미실현 평가손익까지</span> 포함해
                  분석합니다. 랭킹 상위 유저에게도 “미실현 손실이 쌓이고 손절을 회피하는 패턴”을
                  똑같이 짚어줍니다.
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={120} className="order-1 lg:order-2">
            <Eyebrow>순위의 함정</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              순위가 곧 좋은
              <br />
              투자자를 뜻하진 않는다
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
              랭킹과 AI 리포트의 기준을 일부러 다르게 설계했습니다. 이 불일치 자체가 “실현손익 1등이
              반드시 건강한 투자를 하고 있다는 뜻은 아니다”라는 메시지를 전합니다. 숫자 뒤에 가려진
              습관을 함께 보게 만드는 장치입니다.
            </p>
            <div className="mt-8">
              <LinkButton to="/rankings" withIcon>
                랭킹 페이지 보기
              </LinkButton>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
