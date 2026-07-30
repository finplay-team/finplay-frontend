// 단계별 튜토리얼 미션으로 온보딩 흐름을 보여주는 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Check, Target } from '../ui/icons'

const steps = [
  { title: '첫 매수 체결', desc: '아무 종목이나 한 번 담아 계좌를 채웁니다.', done: true },
  { title: '투자일기 작성', desc: '근거와 메모를 남겨 첫 의사결정 로그를 만듭니다.', done: true },
  { title: '분산투자 달성', desc: '서로 다른 3개 종목에 나눠 담습니다.', done: false },
  { title: '첫 복기 확인', desc: 'AI 복기 피드백을 열람합니다.', done: false },
]

export function Missions() {
  return (
    <section className="px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal className="max-w-2xl">
          <Eyebrow>미션 · 튜토리얼</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            처음이라도 괜찮게, 단계별로
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
            첫 거래부터 분산투자, 투자일기, 복기까지. 튜토리얼을 따라가다 보면 자연스럽게 서비스의
            핵심 흐름을 익히게 됩니다. 단계를 완료할 때마다 초기지급액의 일부가 보너스로 지급되고,
            공정한 비교를 위해 랭킹은 수익률(%) 기준으로 산정합니다.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <Card className="h-full">
                <div className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-muted">
                      STEP {i + 1}
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        s.done ? 'bg-emerald-500 text-white' : 'bg-black/[0.04] text-muted'
                      }`}
                    >
                      {s.done ? <Check width={16} height={16} /> : <Target width={16} height={16} />}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{s.desc}</p>
                  <span
                    className={`mt-5 inline-flex w-fit rounded-full px-3 py-1 text-xs ${
                      s.done ? 'bg-emerald-50 text-emerald-600' : 'bg-black/[0.04] text-muted'
                    }`}
                  >
                    {s.done ? '완료' : '진행 전'}
                  </span>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
