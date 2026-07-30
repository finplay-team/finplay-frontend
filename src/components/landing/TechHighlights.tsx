// 실시간 시세·정합성·이벤트 기반·AI 제약 등 기술 신뢰 근거를 보여주는 섹션 (증권사명 없이)
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Bolt, Shield, Layers, Cpu } from '../ui/icons'

const items = [
  {
    icon: <Bolt width={20} height={20} />,
    title: '실시간 시세 스트리밍',
    desc: '고빈도 시세는 Redis Pub/Sub → WebSocket으로 브로드캐스트. 코인은 실시간, 주식은 시세 공급자 추상화로 대응합니다.',
  },
  {
    icon: <Shield width={20} height={20} />,
    title: '동시 매매 정합성',
    desc: '분산락·낙관적 락으로 잔고와 수량을 원자적으로 처리해, 동시 주문에서도 데이터가 어긋나지 않게 합니다.',
  },
  {
    icon: <Layers width={20} height={20} />,
    title: '이벤트 기반 아키텍처',
    desc: '주문 체결처럼 유실되면 안 되는 이벤트는 Kafka로 발행해 포트폴리오·알림·랭킹·투자일기 컨슈머가 병렬 소비합니다.',
  },
  {
    icon: <Cpu width={20} height={20} />,
    title: '제약된 AI 연동',
    desc: '집계·대조 로직은 직접 설계하고 서술만 LLM에 위임합니다. 프롬프트에 종목 추천 금지를 명시하고 응답을 검증합니다.',
  },
]

export function TechHighlights() {
  return (
    <section id="tech" className="scroll-mt-24 px-4 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>기술 하이라이트</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            보이지 않는 곳이 더 단단하다
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted">
            실시간성이 중요하고 유실돼도 되는 데이터와, 정합성이 중요하고 다중 소비자가 필요한
            이벤트를 역할에 따라 구분해 설계했습니다.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={(i % 2) * 100}>
              <Card className="h-full">
                <div className="flex h-full gap-5 p-7">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    {it.icon}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{it.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{it.desc}</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
