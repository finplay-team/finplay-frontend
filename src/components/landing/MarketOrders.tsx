// 시장가 모의매매 흐름(시드머니·즉시 체결·수수료·손익 추적)을 설명하는 랜딩 섹션
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { Reveal } from '../ui/Reveal'
import { Check } from '../ui/icons'

const points = [
  {
    title: '가입하면 계좌가 바로 생긴다',
    desc: '주식·코인 계좌가 자동으로 만들어지고 계좌마다 가상 시드머니 1,000만원이 지급됩니다. 개설 절차가 따로 없습니다.',
  },
  {
    title: '주문은 시장가, 결과는 즉시',
    desc: '지정가나 미체결 대기 개념이 없습니다. 주문을 내면 그 시점 시세로 곧바로 체결된 결과가 돌아옵니다.',
  },
  {
    title: '수수료는 서버가 계산한다',
    desc: '주식 0.015%, 코인 0.05% 수수료가 체결 결과에 반영됩니다. 화면이 따로 어림해서 보여주는 값이 아닙니다.',
  },
  {
    title: '손익을 끝까지 따라간다',
    desc: '보유 수량과 평균단가, 평가손익, 매도로 확정된 실현손익, 계좌 수익률을 한 화면에서 확인합니다.',
  },
  {
    title: '주문 못 하는 이유를 감추지 않는다',
    desc: '주식은 평일 09:00~15:30에만, 코인은 24시간 주문할 수 있습니다. 장이 닫혔거나 시세를 받을 수 없으면 버튼을 막고 사유를 적습니다.',
  },
]

export function MarketOrders() {
  return (
    <section className="relative overflow-hidden px-4 py-20 md:py-28">
      <div
        aria-hidden
        className="orb -right-32 top-1/3 h-96 w-96 animate-float-orb"
        style={{ animationDelay: '2s' }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 md:grid-cols-2 md:items-start md:gap-20">
        <Reveal className="md:sticky md:top-32">
          <Eyebrow>시장가 모의매매</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            사는 순간,
            <br />
            <span className="text-brand">바로</span> 결과가 나온다
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            실제 자금은 한 푼도 쓰이지 않습니다. 대신 체결 가격과 수수료, 잔고 변화는 실제 계산 그대로
            남아서 판단의 결과를 정직하게 되돌려 줍니다.
          </p>
        </Reveal>

        <div className="space-y-4">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <Card className="lift">
                <div className="flex gap-4 p-6">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Check width={16} height={16} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink">{p.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.desc}</p>
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
