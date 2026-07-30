// 고객센터 페이지 — 빠른 도움말과 FAQ 아코디언 (1:1 문의 폼은 백엔드에 없어 제거됨)
import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Chart, Layers, Shield } from '../components/ui/icons'

const quickHelp = [
  {
    icon: Chart,
    title: '모의투자 시작하기',
    desc: '가입하면 주식·코인 계좌가 함께 생성되고 바로 시장가 매매를 연습할 수 있습니다.',
  },
  {
    icon: Layers,
    title: '계좌·시드머니 안내',
    desc: '계좌마다 가상 시드머니 1,000만원이 지급되며 실제 자금은 사용되지 않습니다.',
  },
  {
    icon: Shield,
    title: '시세와 주문 가능 시간',
    desc: '주식은 과거 거래일 시세를 재생해 09:00~15:30에만, 코인은 빗썸 실시간 시세로 24시간 주문할 수 있습니다.',
  },
]

const faqs = [
  {
    q: '모의투자는 실제 돈인가요?',
    a: '아니요. 모든 거래는 가상 자산으로 이뤄지며 실제 돈이 오가지 않습니다. 부담 없이 전략을 연습하는 교육용 환경입니다.',
  },
  {
    q: '주식 시세 날짜가 오늘이 아닌데 왜 그런가요?',
    a: '주식은 오늘의 실시간 시세가 아니라 과거 거래일에 기록된 1분봉을 순서대로 다시 재생합니다. 그래서 화면에 재생 중인 원본 거래일을 함께 표시합니다. 움직임은 실제 있었던 값이지만 오늘 가격은 아닙니다. 코인은 빗썸에서 받은 오늘의 실시간 시세를 그대로 씁니다.',
  },
  {
    q: '지금 주문이 되지 않습니다.',
    a: '주식 주문은 평일 09:00~15:30에만 가능합니다. 코인은 시간 제한이 없지만, 어느 쪽이든 해당 종목의 시세를 받을 수 없으면 주문할 수 없습니다. 어느 쪽인지 화면에 사유가 표시되니 함께 확인해 주세요.',
  },
  {
    q: '주문은 어떤 유형을 낼 수 있나요?',
    a: '시장가 주문만 지원합니다. 지정가나 미체결 대기 주문은 없으며, 주문을 내면 그 시점 시세로 즉시 체결됩니다.',
  },
  {
    q: '수수료는 어떻게 계산되나요?',
    a: '수수료는 서버가 계산해 체결 결과에 반영합니다. 체결 금액 기준으로 주식은 0.015%, 코인은 0.05%이며, 화면에서 따로 어림해 보여주는 값이 아닙니다.',
  },
  {
    q: '시드머니와 수익률 기준은 무엇인가요?',
    a: '가입하면 주식 계좌와 코인 계좌에 각각 가상 시드머니 1,000만원이 지급됩니다. 수익률은 계좌별로 (평가자산 − 시드머니) ÷ 시드머니 로 계산하며, 실현손익과 미실현손익을 함께 확인할 수 있습니다.',
  },
  {
    q: '차트에 분봉이 보이지 않습니다.',
    a: '장 준비 전이거나 아직 공개된 분봉이 없는 상태입니다. 오류가 아니며, 시세가 공개되면 자동으로 채워집니다.',
  },
  {
    q: '코인도 거래할 수 있나요?',
    a: '네. 거래 화면 상단의 시장 탭에서 코인으로 바꾸면 됩니다. 코인은 24시간 거래되고 0.001 같은 소수점 수량으로 주문할 수 있으며, 시세는 빗썸에서 받은 실시간 값입니다. 다만 주식 계좌와 코인 계좌는 완전히 분리돼 있어 두 계좌 사이 이체는 되지 않습니다.',
  },
  {
    q: '커뮤니티 글이나 댓글을 수정·삭제할 수 없습니다.',
    a: '글과 댓글은 작성자 본인만 수정·삭제할 수 있고, 최종 판단은 서버가 합니다. 버튼이 보였더라도 권한이 없다는 안내가 나오면 본인 글이 아닌 경우입니다.',
  },
]

export function Support() {
  const [openId, setOpenId] = useState<number | null>(0)

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-4xl">
        {/* 1. 헤더 */}
        <header className="text-center">
          <div className="flex justify-center">
            <Eyebrow>고객센터</Eyebrow>
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-ink md:text-5xl">
            무엇을 도와드릴까요
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            자주 묻는 질문에서 서비스 동작 방식을 먼저 확인해 보세요.
          </p>
        </header>

        {/* 2. 빠른 도움말 */}
        <section className="mt-14 grid gap-5 sm:grid-cols-3">
          {quickHelp.map(({ icon: Icon, title, desc }) => (
            <Card key={title} accent="brand" innerClassName="p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Icon width={20} height={20} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
            </Card>
          ))}
        </section>

        {/* 3. FAQ 아코디언 */}
        <section className="mt-16">
          <div className="flex items-center gap-3">
            <Eyebrow>자주 묻는 질문</Eyebrow>
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">FAQ</h2>
          <Card className="mt-6" innerClassName="divide-y divide-line">
            {faqs.map((faq, i) => {
              const open = openId === i
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="font-medium text-ink">{faq.q}</span>
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-soft text-lg leading-none text-brand transition-transform duration-300 ease-spring ${
                        open ? 'rotate-45' : ''
                      }`}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                  {open && (
                    <p className="px-6 pb-5 text-sm leading-relaxed text-muted">{faq.a}</p>
                  )}
                </div>
              )
            })}
          </Card>
        </section>

        {/* 4. 하단 안내 */}
        <Card className="mt-8" accent="none" innerClassName="p-6 md:p-8">
          <p className="text-xs leading-relaxed text-muted">
            Investory는 가상 자산 기반의 교육용 모의투자 프로토타입입니다. 실제 금융 거래나 투자
            권유를 제공하지 않습니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
