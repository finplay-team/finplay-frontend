// 우측 하단에 떠 있는 규칙 기반 AI 어시스턴트 채팅 위젯
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkle, Close, ArrowRight, Shield, Chart } from './ui/icons'

type Role = 'user' | 'assistant'

interface TechBlock {
  title: string
  points: string[]
}

interface Message {
  id: number
  role: Role
  text: string
  tech?: TechBlock
}

// 교육용 안내임을 알리는 공통 면책 문구
const DISCLAIMER = '이 안내는 교육용 도움말이며 투자 자문이 아닙니다.'

let seq = 1
const nextId = () => seq++

function makeAssistant(text: string, tech?: TechBlock): Message {
  return { id: nextId(), role: 'assistant', text, tech }
}

function makeUser(text: string): Message {
  return { id: nextId(), role: 'user', text }
}

// 첫 인사 메시지
const greeting = makeAssistant(
  '안녕하세요, Investory 어시스턴트예요. 모의 거래, 투자일기 복기, 랭킹, 튜토리얼 보상, 계좌 분리 같은 사용법을 도와드릴 수 있어요. 무엇이 궁금하신가요?',
)

// 사용자 입력 키워드를 매칭해 정해진 답변을 돌려주는 규칙 기반 함수
function getReply(userText: string): Message {
  const t = userText.toLowerCase().trim()

  const has = (...keys: string[]) => keys.some((k) => t.includes(k))

  // 종목 추천 거절 (안전상 반드시 거절)
  if (has('추천', '뭐 사', '뭐사', '뭐가 오를', '오를까', '사도 될', '살까', '매수 종목', '떡상')) {
    return makeAssistant(
      '죄송하지만 특정 종목의 매수·매도 추천은 제공하지 않아요. Investory는 어떤 종목을 사라고 알려주는 서비스가 아니라, 투자 습관을 기르고 판단하는 방법을 연습하도록 돕는 교육용 서비스예요. 대신 거래 방법, 투자일기 복기, 기술적 관점 같은 학습은 얼마든지 도와드릴게요. ' +
        DISCLAIMER,
    )
  }

  // 기술적/차트 분석 관점 (tech 블록 포함, 일반적·교육적 내용)
  if (has('기술적', '차트', '분석', '판단', '지표', '이평', '이동평균')) {
    return makeAssistant(
      '특정 종목 판단 대신, 차트를 볼 때 참고하는 일반적인 관점을 알려드릴게요. 아래는 방향을 정해주는 신호가 아니라 스스로 판단을 연습하기 위한 체크 포인트예요.',
      {
        title: '기술적 관점 (교육용)',
        points: [
          '추세: 가격이 이동평균선 위/아래 어디에 있는지로 큰 흐름을 확인하는 관점.',
          '변동성: 등락이 큰 구간에서는 분할 매수로 리스크를 나누는 방법을 고려하는 관점.',
          '거래량: 돌파가 나올 때 거래량이 실렸는지 확인해 신뢰도를 가늠하는 관점.',
        ],
      },
    )
  }

  // 거래 방법
  if (has('어떻게 사', '매수', '매도', '거래', '주문', '사는 법', '사는법', '어떻게 거래')) {
    return makeAssistant(
      '거래는 거래 페이지(/trade)에서 해요. 원하는 종목을 고른 뒤 시장가로 바로 체결하거나, 지정가로 원하는 가격을 걸어 주문할 수 있어요. 수량과 가격을 확인하고 주문을 넣으면 포트폴리오에 반영돼요. ' +
        DISCLAIMER,
    )
  }

  // 투자일기 / 복기
  if (has('투자일기', '일기', '복기', '메모', '근거')) {
    return makeAssistant(
      '매매할 때 왜 샀는지 근거와 메모를 함께 남겨 두면, 일정 시간이 지난 뒤 AI 복기가 자동으로 붙어요. 그때의 판단과 이후 결과를 비교하면서 습관을 다듬는 게 핵심이에요. ' +
        DISCLAIMER,
    )
  }

  // 랭킹 / 수익률
  if (has('랭킹', '순위', '수익률', '랭크')) {
    return makeAssistant(
      '랭킹은 수익률(%)을 기준으로 매겨져요. 주식과 코인은 성격이 달라 각각 분리된 랭킹으로 보여드려서, 같은 자산군끼리 공정하게 비교할 수 있어요. ' +
        DISCLAIMER,
    )
  }

  // 인사 / 도움
  if (has('안녕', '하이', '도움', '뭐 할', '뭐할', '기능', '헬프', 'help', '사용법')) {
    return makeAssistant(
      '거래(/trade)로 모의 매매를 하고, 투자일기에 근거를 남겨 AI 복기를 받고, 랭킹에서 수익률을 겨루고, 튜토리얼을 끝내면 보상을 받을 수 있어요. 주식과 코인 계좌는 분리돼 있어 자산군별로 따로 관리돼요. 어떤 것부터 살펴볼까요?',
    )
  }

  // 고객센터 안내 (기본)
  return makeAssistant(
    '음, 제가 정확히 이해했는지 모르겠어요. 거래 방법, 투자일기, 랭킹, 기술적 관점처럼 구체적으로 물어봐 주시면 더 잘 도와드릴 수 있어요. 더 자세한 문의는 고객센터(/support)에서 도와드려요.',
  )
}

const suggestions = [
  '매수는 어떻게 하나요?',
  '투자일기가 뭔가요?',
  '기술적 관점 알려줘',
  '고객센터 문의',
]

export function AssistantWidget() {
  // DEV 캡처용: ?bot=open 쿼리면 처음부터 패널을 연다
  const [open, setOpen] = useState(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('bot') === 'open',
  )
  const [messages, setMessages] = useState<Message[]>([greeting])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // 새 메시지가 붙으면 하단으로 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const reply = getReply(text)
    setMessages((prev) => [...prev, makeUser(text), reply])
    setInput('')
  }

  return (
    <>
      {/* 채팅 패널 */}
      <div
        className={`fixed bottom-24 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm origin-bottom-right transition-all duration-400 ease-spring ${
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-bezel border border-black/[0.06] bg-white shadow-soft">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
                <Sparkle width={17} height={17} />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-ink">Investory 어시스턴트</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-eyebrow text-brand">
                  <span className="rounded-full bg-brand-soft px-1.5 py-0.5">AI</span>
                  교육용 도우미
                </span>
              </div>
            </div>
            <button
              aria-label="닫기"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-300 hover:bg-black/5 hover:text-ink"
            >
              <Close width={16} height={16} />
            </button>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-brand text-white'
                      : 'bg-canvas text-ink'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.tech && (
                    <div className="mt-2.5 rounded-xl bg-brand-soft px-3 py-2.5 text-ink">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-eyebrow text-brand">
                        <Chart width={13} height={13} />
                        {m.tech.title}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {m.tech.points.map((p, i) => (
                          <li key={i} className="flex gap-1.5 text-[12px] text-muted">
                            <span className="text-brand">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted">
                        <Shield width={11} height={11} />
                        {DISCLAIMER}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 빠른 제안 칩 */}
          <div className="flex flex-wrap gap-1.5 border-t border-line px-4 pt-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-muted transition-colors duration-300 hover:border-brand/40 hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>

          {/* 입력 행 */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 px-4 py-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="궁금한 점을 입력하세요."
              className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 py-2.5 text-[13px] text-ink outline-none transition-colors duration-300 placeholder:text-muted focus:border-brand/40"
            />
            <button
              type="submit"
              aria-label="보내기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-all duration-400 ease-spring hover:bg-black active:scale-[0.98]"
            >
              <ArrowRight width={16} height={16} />
            </button>
          </form>

          {/* 고객센터 링크 */}
          <div className="border-t border-line px-4 py-2.5 text-center">
            <Link
              to="/support"
              onClick={() => setOpen(false)}
              className="text-[11px] text-muted transition-colors duration-300 hover:text-brand"
            >
              더 궁금하면 고객센터로 문의하세요.
            </Link>
          </div>
        </div>
      </div>

      {/* 런처 버튼 */}
      <button
        aria-label={open ? '어시스턴트 닫기' : '어시스턴트 열기'}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-soft transition-all duration-400 ease-spring hover:scale-105 active:scale-95"
      >
        {open ? <Close width={22} height={22} /> : <Sparkle width={24} height={24} />}
      </button>
    </>
  )
}
