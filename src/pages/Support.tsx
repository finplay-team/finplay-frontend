// 고객센터·문의 페이지 — 빠른 도움말·FAQ 아코디언·문의 폼(mock)을 제공
import { useState, type FormEvent } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Chart, Coin, Notebook, Check } from '../components/ui/icons'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const quickHelp = [
  {
    icon: Chart,
    title: '모의투자 시작하기',
    desc: '가입하면 주식·코인 계좌가 자동 생성되고 바로 매매를 연습할 수 있습니다.',
  },
  {
    icon: Coin,
    title: '계좌·시드머니 안내',
    desc: '계좌별로 가상 시드머니 1,000만원이 지급되며 실제 자금은 사용되지 않습니다.',
  },
  {
    icon: Notebook,
    title: '투자일기·AI 리포트',
    desc: '매매 근거를 기록하면 AI가 습관과 패턴을 분석해 주간 리포트를 제공합니다.',
  },
]

const faqs = [
  {
    q: '모의투자는 실제 돈인가요?',
    a: '아니요. 모든 거래는 가상 자산으로 이뤄지며 실제 돈이 오가지 않습니다. 부담 없이 전략을 연습하는 교육용 환경입니다.',
  },
  {
    q: '시드머니는 얼마인가요?',
    a: '계좌별로 가상 시드머니 1,000만원이 지급됩니다. 주식 계좌와 코인 계좌가 각각 별도로 지급됩니다.',
  },
  {
    q: '주식 계좌와 코인 계좌를 합칠 수 있나요?',
    a: '두 계좌는 합칠 수 없습니다. 시장 특성이 달라 자산과 손익을 분리해 관리하도록 설계되어 있습니다.',
  },
  {
    q: '튜토리얼 보상은 어떻게 받나요?',
    a: '단계를 완료한 뒤 내정보 페이지에서 보상 받기를 누르면 초기지급액의 일정 비율이 각 계좌에 지급됩니다.',
  },
  {
    q: 'AI가 종목을 추천해 주나요?',
    a: '종목을 추천하지는 않습니다. AI는 매매 습관과 패턴에 대한 피드백만 제공하며, 투자 판단은 사용자가 직접 내립니다.',
  },
  {
    q: '랭킹은 어떻게 산정되나요?',
    a: '기간별 누적 수익률을 기준으로 산정됩니다. 계좌 유형별로 랭킹이 나뉘어 공정하게 비교할 수 있습니다.',
  },
]

const inquiryTypes = ['계정', '거래', '버그', '기타']

interface Errors {
  name?: string
  email?: string
  message?: string
}

export function Support() {
  const [openId, setOpenId] = useState<number | null>(0)
  const [form, setForm] = useState({ name: '', email: '', type: '계정', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = (): Errors => {
    const next: Errors = {}
    if (form.name.trim().length < 2) next.name = '이름은 2자 이상이어야 합니다.'
    if (!emailRe.test(form.email)) next.email = '올바른 이메일 형식이 아닙니다.'
    if (form.message.trim().length < 10) next.message = '문의 내용을 10자 이상 입력해 주세요.'
    return next
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSubmitted(true)
      setForm({ name: '', email: '', type: '계정', message: '' })
    }, 600)
  }

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
            자주 묻는 질문을 먼저 확인해 보세요. 원하는 답을 찾지 못하셨다면 아래 문의 폼으로 남겨
            주시면 빠르게 도와드리겠습니다.
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
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-brand-soft/30"
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

        {/* 4. 문의 폼 */}
        <section className="mt-16">
          <div className="flex items-center gap-3">
            <Eyebrow>문의하기</Eyebrow>
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">1:1 문의</h2>
          <p className="mt-2 text-sm text-muted">
            답변받을 이메일과 함께 문의 내용을 남겨 주세요. 영업일 기준 1~2일 내에 회신드립니다.
          </p>

          {submitted ? (
            <Card className="mt-6" accent="brand" innerClassName="p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Check width={22} height={22} />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                문의가 접수되었습니다.
              </h3>
              <p className="mt-2 text-sm text-muted">영업일 기준 1~2일 내 답변드립니다.</p>
              <div className="mt-6 flex justify-center">
                <Button variant="soft" onClick={() => setSubmitted(false)}>
                  다른 문의 남기기
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="mt-6" innerClassName="p-6 md:p-8">
              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <Field
                  label="이름"
                  name="name"
                  placeholder="홍길동"
                  value={form.name}
                  onChange={update('name')}
                  error={errors.name}
                />
                <Field
                  label="이메일"
                  name="email"
                  type="email"
                  placeholder="you@investory.app"
                  value={form.email}
                  onChange={update('email')}
                  error={errors.email}
                  autoComplete="email"
                />
                <label htmlFor="type" className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">문의 유형</span>
                  <select
                    id="type"
                    name="type"
                    value={form.type}
                    onChange={update('type')}
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring focus:border-brand focus:ring-4 focus:ring-brand/10"
                  >
                    {inquiryTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="message" className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">내용</span>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="문의하실 내용을 자세히 적어 주세요."
                    value={form.message}
                    onChange={update('message')}
                    className={`w-full resize-y rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/10 ${
                      errors.message ? 'border-rose-400' : 'border-line'
                    }`}
                  />
                  {errors.message && (
                    <span className="mt-1.5 block text-xs text-rose-500">{errors.message}</span>
                  )}
                </label>

                <Button type="submit" size="lg" withIcon disabled={loading} className="w-full">
                  {loading ? '접수 중…' : '문의 보내기'}
                </Button>
              </form>
            </Card>
          )}
        </section>

        {/* 5. 하단 안내 */}
        <Card className="mt-8" accent="none" innerClassName="p-6 md:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">운영시간</h3>
              <p className="mt-2 text-sm text-muted">평일 10:00–18:00 (주말·공휴일 휴무)</p>
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">이메일 문의</h3>
              <p className="mt-2 text-sm text-muted">support@investory.app</p>
            </div>
          </div>
          <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-muted">
            Investory는 가상 자산 기반의 교육용 모의투자 프로토타입입니다. 실제 금융 거래나 투자
            권유를 제공하지 않으며, 안내된 이메일·연락처는 데모용 예시입니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
