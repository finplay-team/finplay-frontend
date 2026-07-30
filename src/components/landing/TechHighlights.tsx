// 실제 구현된 스택(Spring Boot·MySQL·Redis·SSE·멱등 주문)만 근거로 신뢰를 설명하는 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Bolt, Shield, Layers, Cpu } from '../ui/icons'

const items = [
  {
    icon: <Bolt width={20} height={20} />,
    title: 'SSE 단방향 시세 스트리밍',
    desc: '시세는 서버가 밀어 주는 SSE 한 방향으로 흐릅니다. 구독 직후 전체 스냅샷을 한 번 주고 이후에는 새로 공개된 종목만 보내며, 주기적인 하트비트로 연결을 유지합니다.',
  },
  {
    icon: <Cpu width={20} height={20} />,
    title: 'Redis 시세 저장소',
    desc: '최신 가격은 Redis에 두고 읽습니다. 값이 없으면 임의 가격을 지어내지 않고 시세 없음으로 응답해, 잘못된 가격에 체결되는 일을 원천적으로 막습니다.',
  },
  {
    icon: <Shield width={20} height={20} />,
    title: '멱등 주문 처리',
    desc: '모든 주문에 멱등 키를 요구합니다. 같은 키의 재전송은 처음 결과를 그대로 돌려주고 키가 같은데 내용이 다르면 거부하므로, 네트워크 재시도로 중복 체결이 생기지 않습니다.',
  },
  {
    icon: <Layers width={20} height={20} />,
    title: 'MySQL 트랜잭션 정합성',
    desc: '주문·체결·잔고·보유 수량은 Spring Boot 서비스의 한 트랜잭션 안에서 함께 갱신되고, 스키마 변경은 Flyway 마이그레이션으로만 반영합니다.',
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
            Spring Boot · MySQL · Redis · SSE 로 만들었습니다. 실시간성이 중요한 시세와 정합성이
            중요한 주문을 서로 다른 방식으로 다룹니다.
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
