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

/**
 * 용어 질문을 맨 위에 둔다 — 나머지는 전부 "서비스가 어떻게 동작하는가"라서, 단어 자체를 모르는
 * 사람은 첫 화면에서 막힌다. 아래 답변의 수치·동작은 전부 실제 구현 기준이다(손절 -3%·익절 +5%는
 * 튜토리얼이 체결가 기준으로 자동 고정하는 값, 샘플 종목 제외 범위는 spec 033 + 포트폴리오
 * 체결·주문 내역 필터, 보상은 시장당 최초 1회 500만원).
 */
const faqs = [
  {
    q: '매수·매도가 무슨 뜻인가요?',
    a: '매수는 사는 것, 매도는 파는 것입니다. 주문을 내면 그 자리에서 값이 정해져 거래가 성사되는데 이걸 체결이라고 합니다. 이익이나 손실은 살 때와 팔 때의 값 차이에서 생기며, 팔기 전까지는 아직 확정된 게 아닙니다.',
  },
  {
    q: '시장가와 지정가는 뭐가 다른가요?',
    a: '시장가는 "지금 값에 바로 사달라"는 주문이라 즉시 체결되고, 지정가는 "이 값이 되면 사달라"고 걸어두는 주문이라 그 값이 될 때까지 기다립니다. 값이 거기까지 오지 않으면 영영 안 사질 수도 있습니다. 주식은 시장가만, 코인은 둘 다 낼 수 있습니다.',
  },
  {
    q: '손절과 익절이 뭔가요?',
    a: '손절은 값이 미리 정해둔 선까지 내려가면 더 버티지 않고 팔아서 손실을 작게 막는 것이고, 익절은 정해둔 선까지 오르면 욕심내지 않고 팔아서 이익을 확정하는 것입니다. 튜토리얼에서는 산 값을 기준으로 -3%를 손절선, +5%를 익절선으로 자동 계산해 차트에 표시해 드립니다. 직접 입력하지 않아도 됩니다.',
  },
  {
    q: '튜토리얼에서 산 종목이 포트폴리오에 보이지 않습니다.',
    a: '튜토리얼에 나오는 종목은 연습용으로 만든 가상 종목이라 실제 기록에서 일부러 빼고 있습니다. 그래서 포트폴리오의 보유 목록과 체결·주문 내역, 투자일기 목록, 랭킹에 나타나지 않고, 평가자산과 수익률에도 반영되지 않습니다. 오류가 아니라 연습 기록이 실제 성적에 섞이지 않게 한 것입니다.',
  },
  {
    q: '튜토리얼을 주식과 코인 두 번 해야 하나요?',
    a: '네. 튜토리얼은 시장별로 따로 진행되고 따로 완료됩니다. 완료 보상 500만원도 시장마다 최초 1회씩만 지급되므로, 주식과 코인을 각각 한 번씩 끝내면 두 번 받게 됩니다. 이미 완료한 시장을 다시 시작해 또 끝내는 것은 가능하지만 보상이 다시 나오지는 않습니다. 보상금은 그 계좌의 주문 가능 현금으로 들어오되, 연습으로 받은 돈이 성적을 좋아 보이게 하지 않도록 수익률 계산에서는 빠집니다.',
  },
  {
    q: '모의투자는 실제 돈인가요?',
    a: '아니요. 모든 거래는 가상 자산으로 이뤄지며 실제 돈이 오가지 않습니다. 부담 없이 전략을 연습하는 교육용 환경입니다.',
  },
  {
    q: '주식 시세 날짜가 오늘이 아닌데 왜 그런가요?',
    a: '주식은 오늘의 실시간 시세가 아니라 과거 거래일에 기록된 1분봉(1분 동안의 가격 움직임을 막대 하나로 묶은 것)을 순서대로 다시 재생합니다. 그래서 화면에 재생 중인 원본 거래일을 함께 표시합니다. 움직임은 실제 있었던 값이지만 오늘 가격은 아닙니다. 코인은 빗썸에서 받은 오늘의 실시간 시세를 그대로 씁니다.',
  },
  {
    q: '지금 주문이 되지 않습니다.',
    a: '주식 주문은 평일 09:00~15:30에만 가능합니다. 코인은 시간 제한이 없지만, 어느 쪽이든 해당 종목의 시세를 받을 수 없으면 주문할 수 없습니다. 어느 쪽인지 화면에 사유가 표시되니 함께 확인해 주세요.',
  },
  {
    q: '주문은 어떤 유형을 낼 수 있나요?',
    a: '주식은 시장가 주문만 지원합니다. 지정가나 미체결 대기 주문은 없으며, 주문을 내면 그 시점 시세로 즉시 체결됩니다. 코인은 시장가에 더해 지정가 주문도 낼 수 있습니다 — 원하는 가격을 걸어 미체결로 대기시키고, 조건을 만족하면 그때 체결됩니다. 대기 중인 지정가 주문은 체결 전까지 언제든 가격·수량을 바꾸거나 취소할 수 있습니다.',
  },
  {
    q: '수수료는 어떻게 계산되나요?',
    a: '수수료는 서버가 계산해 체결 결과에 반영합니다. 체결 금액 기준으로 주식은 0.015%, 코인은 0.05%이며, 화면에서 따로 어림해 보여주는 값이 아닙니다.',
  },
  {
    q: '시드머니와 수익률 기준은 무엇인가요?',
    a: '가입하면 주식 계좌와 코인 계좌에 각각 가상 시드머니 1,000만원이 지급됩니다. 수익률은 계좌별로 (평가자산 − 시드머니) ÷ 시드머니 로 계산하며, 실현손익과 미실현손익을 함께 확인할 수 있습니다. 평가자산은 남은 현금과 보유 종목의 현재 가치를 합한 금액이고, 실현손익은 이미 팔아서 확정된 손익, 미실현손익은 아직 들고 있는 종목에서 계산한 아직 확정되지 않은 손익입니다.',
  },
  {
    q: '차트에 분봉이 보이지 않습니다.',
    a: '분봉은 1분 단위로 묶은 가격 막대를 말합니다. 장 준비 전이거나 아직 공개된 분봉이 없는 상태입니다. 오류가 아니며, 시세가 공개되면 자동으로 채워집니다.',
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
            모르는 단어와 서비스 동작 방식을 자주 묻는 질문에서 먼저 확인해 보세요.
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
            FinPlay는 가상 자산 기반의 교육용 모의투자 프로토타입입니다. 실제 금융 거래나 투자
            권유를 제공하지 않습니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
