// AI 투자 습관 분석 — 거래 지표 집계 + 종목 추천 없는 패턴 피드백 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Sparkle, Shield } from '../ui/icons'

const metrics = [
  { label: '최근 30일 거래', value: '82', unit: '회' },
  { label: '평균 보유기간', value: '1.8', unit: '일' },
  { label: '손절 비율', value: '73', unit: '%' },
  { label: '단일 종목 집중', value: '6', unit: '회' },
]

export function AiHabit() {
  return (
    <section className="px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>AI 습관 분석</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            수익보다 먼저, 습관을 본다
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            거래 데이터를 집계해 투자 성향을 읽어냅니다. 단기매매 경향, 손절 회피, 종목 편중 같은
            패턴을 짚어줄 뿐, 어떤 종목을 사고팔라고 말하지 않습니다.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-5">
          {/* 지표 그리드 */}
          <Reveal className="lg:col-span-3">
            <Card>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-core bg-line">
                {metrics.map((m) => (
                  <div key={m.label} className="bg-surface p-7">
                    <p className="text-xs text-muted">{m.label}</p>
                    <p className="mt-2 font-display text-4xl font-semibold tabular">
                      {m.value}
                      <span className="ml-1 text-lg font-medium text-muted">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          {/* 피드백 카드 */}
          <Reveal delay={120} className="lg:col-span-2">
            <Card accent="brand" className="h-full">
              <div className="flex h-full flex-col p-7">
                <div className="flex items-center gap-2 text-brand">
                  <Sparkle width={16} height={16} />
                  <span className="text-xs font-medium uppercase tracking-eyebrow">주간 리포트</span>
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-ink/85">
                  최근 매매가 평균 1.8일로 매우 짧습니다. 손절 비율이 높고 상승 종목은 빠르게
                  처분하는 경향이 보입니다. 실현손익은 양호하지만 미실현 손실이 누적되고 있어,
                  손절 기준을 정해 두는 편을 권합니다.
                </p>
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-canvas px-4 py-3">
                  <Shield width={16} height={16} className="text-emerald-500" />
                  <span className="text-xs text-muted">
                    종목 추천 없이 패턴만 분석합니다
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
