// 캔들을 처음 보는 사람에게 막대 하나의 의미를 그림과 문장으로 설명하는 접이식 안내 카드
import { useState } from 'react'

/** 범례용 미니 캔들. 오른 날(빨강)·내린 날(파랑)을 나란히 보여 색 규칙만 빠르게 익히게 한다. */
function MiniCandle({ tone }: { tone: 'gain' | 'loss' }) {
  return (
    <svg
      viewBox="0 0 20 40"
      width={14}
      height={28}
      aria-hidden="true"
      className={tone === 'gain' ? 'text-gain' : 'text-loss'}
    >
      <line x1={10} x2={10} y1={2} y2={38} stroke="currentColor" strokeWidth={1.6} />
      <rect x={4} y={11} width={12} height={19} fill="currentColor" />
    </svg>
  )
}

export function CandleGuide() {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="candle-guide-panel"
        className="flex w-full items-center justify-between rounded-2xl border border-line bg-elevated px-5 py-3.5 text-sm text-ink transition-colors duration-300 hover:bg-white/[0.06]"
      >
        <span className="font-medium">막대 하나가 무슨 뜻인가요?</span>
        <span
          aria-hidden="true"
          className={`text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id="candle-guide-panel"
          className="mt-3 rounded-2xl border border-line bg-elevated px-5 py-5"
        >
          {/*
            막대 하나를 크게 그린 그림. 차트와 같은 방식(라이브러리 없는 인라인 SVG)으로 그려
            위에서 보고 있는 캔들과 형태가 그대로 이어지게 한다. 빨간(오른 날) 막대를 예로 든다.
          */}
          <svg
            viewBox="0 0 320 234"
            width="100%"
            height={234}
            role="img"
            aria-label="캔들 한 개의 구조. 굵은 몸통의 아래 끝이 그날 시작한 값, 위 끝이 끝난 값이고, 몸통 위아래로 삐져나온 얇은 선이 하루 중 최고값과 최저값이다."
            className="mx-auto block max-w-[340px]"
          >
            {/* 캔들 본체 — 오른 날이라 몸통 아래가 시작한 값, 위가 끝난 값이다 */}
            <g className="text-gain">
              <line x1={96} x2={96} y1={26} y2={200} stroke="currentColor" strokeWidth={2} />
              <rect x={75} y={66} width={42} height={90} fill="currentColor" />
            </g>

            {/* 왼쪽 — 몸통과 꼬리를 이름으로 묶어 준다 */}
            <g className="text-line" fill="none" stroke="currentColor" strokeWidth={1.4}>
              {/* 세 구간(위 꼬리 · 몸통 · 아래 꼬리)이 한 줄로 붙어 보이지 않게 사이를 띄운다 */}
              <path d="M64 28 H58 V62 H64" />
              <path d="M64 70 H56 V152 H64" />
              <path d="M64 160 H58 V198 H64" />
            </g>
            <text x={6} y={46} fontSize={11} fill="currentColor" className="text-muted">
              꼬리
            </text>
            <text x={6} y={107} fontSize={12} fontWeight={600} fill="currentColor" className="text-ink">
              몸통
            </text>
            <text x={6} y={121} fontSize={10} fill="currentColor" className="text-muted">
              시작~끝
            </text>
            <text x={6} y={186} fontSize={11} fill="currentColor" className="text-muted">
              꼬리
            </text>

            {/* 오른쪽 — 네 지점이 각각 무엇인지 가리킨다 */}
            <g className="text-line">
              <line x1={96} x2={150} y1={26} y2={26} stroke="currentColor" strokeDasharray="3 3" />
              <line x1={117} x2={150} y1={66} y2={66} stroke="currentColor" strokeDasharray="3 3" />
              <line x1={117} x2={150} y1={156} y2={156} stroke="currentColor" strokeDasharray="3 3" />
              <line x1={96} x2={150} y1={200} y2={200} stroke="currentColor" strokeDasharray="3 3" />
            </g>
            <g fontSize={11.5} fill="currentColor" className="text-ink">
              <text x={156} y={30}>
                하루 중 최고
                <tspan className="text-muted"> (고가)</tspan>
              </text>
              <text x={156} y={70}>
                그날 끝난 값
                <tspan className="text-muted"> (종가)</tspan>
              </text>
              <text x={156} y={160}>
                그날 시작한 값
                <tspan className="text-muted"> (시가)</tspan>
              </text>
              <text x={156} y={204}>
                하루 중 최저
                <tspan className="text-muted"> (저가)</tspan>
              </text>
            </g>

            <text x={96} y={224} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted">
              오른 날(빨간 막대) 예시
            </text>
          </svg>

          {/* 색 규칙은 그림 하나로 끝난다 — 문장보다 나란히 놓고 보는 편이 빠르다 */}
          <div className="mt-2 flex items-center justify-center gap-6">
            <span className="flex items-center gap-2 text-xs text-muted">
              <MiniCandle tone="gain" />
              오른 날은 빨강
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              <MiniCandle tone="loss" />
              내린 날은 파랑
            </span>
          </div>

          <div className="mt-5 space-y-3.5 text-sm leading-relaxed text-muted">
            <p>
              <strong className="font-medium text-ink">막대 하나가 하루입니다.</strong> 왼쪽이 오래된
              날, 오른쪽이 최근입니다. 지금 보이는 30개는 30일치입니다.
            </p>
            <p>
              <strong className="font-medium text-ink">
                빨간 막대는 오른 날, 파란 막대는 내린 날입니다.
              </strong>{' '}
              그날 시작한 가격보다 끝난 가격이 높으면 빨강, 낮으면 파랑입니다.
            </p>
            <p>
              <strong className="font-medium text-ink">
                굵은 몸통은 시작과 끝, 위아래 얇은 선은 그날의 최고와 최저입니다.
              </strong>{' '}
              몸통의 양 끝이 하루의 시작 가격과 끝 가격입니다. 삐져나온 얇은 선은 하루 중 잠깐 찍었다가
              되돌아온 가장 높은 값과 가장 낮은 값입니다. 선이 길수록 그날 가격이 크게 출렁였다는
              뜻입니다.
            </p>
            <p>
              <strong className="font-medium text-ink">맨 오른쪽 막대는 아직 안 끝났습니다.</strong>{' '}
              오늘이 진행 중이라 이 막대만 3초마다 자랐다 줄었다 합니다. 왼쪽 막대들은 이미 끝난 날이라
              변하지 않습니다.
            </p>
            {/*
              이전에는 "알림이지 자동 주문이 아니다"라고 적어 놨었는데, 실제로는 산 순간 손절·익절
              예약(OCO)이 같이 걸려 그 선에 닿는 순간 자동으로 팔린다(AttemptTutorialFlow.tsx의
              RiskEducationCard와 같은 이유로 2026-08-20 수정, D43).
            */}
            <p>
              <strong className="font-medium text-ink">점선 두 개는 손절·익절선입니다.</strong>{' '}
              가격이 이 선에 닿으면 그 순간 자동으로 팔립니다. 닿기 전에 직접 매도 버튼을 눌러 먼저
              팔 수도 있습니다.
            </p>
            <p className="text-xs">
              막대를 손가락으로 누르거나 마우스를 올리면 그날의 네 가지 값이 그대로 나옵니다.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
