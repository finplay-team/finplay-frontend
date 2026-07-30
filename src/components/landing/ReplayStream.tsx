// 과거 거래일 1분봉을 실시간처럼 재생하는 시세 방식을 설명하는 랜딩 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Bolt, Chart, Shield } from '../ui/icons'

const items = [
  {
    icon: <Chart width={20} height={20} />,
    title: '1분봉 순차 공개',
    desc: '하나의 과거 거래일을 골라 그날의 1분봉을 09:00부터 차례대로 공개합니다. 매분 새로 열린 종목만 내려와 장이 진행되는 것처럼 움직입니다.',
  },
  {
    icon: <Shield width={20} height={20} />,
    title: '원본 거래일을 함께 표시',
    desc: '재생 중인 거래일을 시세 옆에 그대로 적습니다. 오늘 날짜의 시세가 아니라는 사실을 숨기지 않습니다.',
  },
  {
    icon: <Bolt width={20} height={20} />,
    title: '끊기면 스스로 복구',
    desc: '연결이 끊겨 다시 붙으면 16종목 전체 스냅샷을 다시 받습니다. 놓친 구간 때문에 화면이 어긋나지 않습니다.',
  },
]

export function ReplayStream() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>실시간 시세 재생</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            오늘이 아닌,
            <br />
            실제로 있었던 하루
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            시세를 무작위로 만들어 내지 않습니다. 실제 거래일에 기록된 분봉을 그 순서대로 다시
            흘려보내기 때문에 가격의 움직임과 거래량이 모두 실제 있었던 값입니다.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 100}>
              <Card className="lift h-full" accent={i === 0 ? 'brand' : 'none'}>
                <div className="flex h-full flex-col p-7">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    {it.icon}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{it.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{it.desc}</p>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
