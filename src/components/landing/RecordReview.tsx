// 투자일기: 매매 근거 기록 → 이후 AI 복기 대조 과정을 보여주는 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Notebook, Sparkle, ArrowRight } from '../ui/icons'

const bases = ['뉴스', '기술적 분석', '장기 투자', '감', '기타']

export function RecordReview() {
  return (
    <section id="features" className="scroll-mt-24 px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <Eyebrow>투자일기 · 기록 → 복기</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              왜 샀는지 남기면,
              <br />
              무엇이 틀렸는지 보인다
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
              매수·매도하는 순간 판단 근거와 메모를 남깁니다. 일정 시간이 지나면 AI가 당시 근거와
              실제 시세가 움직인 원인을 대조해 복기 피드백을 돌려줍니다. 결과가 아니라 판단의 질을
              되짚는 방식입니다.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                '매매마다 근거 선택 + 메모로 의사결정 로그 기록',
                '일정 기간 후 AI가 근거와 실제 변동 원인을 대조',
                '맞춘 판단·틀린 판단을 구분해 다음 매매에 반영',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-ink/80">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-soft text-brand">
                    <ArrowRight width={13} height={13} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="space-y-4">
            {/* 기록 카드 */}
            <Card accent="brand">
              <div className="p-6">
                <div className="flex items-center gap-2 text-muted">
                  <Notebook width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-eyebrow">매수 기록</span>
                  <span className="ml-auto text-xs text-muted">엔비디아 · 07/14</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {bases.map((b) => (
                    <span
                      key={b}
                      className={`rounded-full px-3 py-1 text-xs ${
                        b === '뉴스'
                          ? 'bg-ink text-white'
                          : 'bg-black/[0.04] text-muted'
                      }`}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <p className="mt-4 rounded-2xl bg-canvas px-4 py-3 text-sm leading-relaxed text-ink/80">
                  “실적 발표에서 데이터센터 매출이 컨센서스를 크게 상회. 단기 상승 기대.”
                </p>
              </div>
            </Card>

            {/* AI 복기 카드 */}
            <Card>
              <div className="p-6">
                <div className="flex items-center gap-2 text-brand">
                  <Sparkle width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-eyebrow">AI 복기 · 14일 후</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink/85">
                  실적을 근거로 매수했지만, 실제 주가는 금리 인하 기대감이 더 크게 작용했습니다.
                  실적 서프라이즈의 영향은 발표 당일 하루에 그쳤고, 이후 상승분의 대부분은 매크로
                  이슈에서 나왔습니다.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-600">
                    방향 적중
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-600">
                    근거는 빗나감
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
