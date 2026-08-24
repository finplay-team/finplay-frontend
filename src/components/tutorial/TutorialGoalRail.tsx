// 화면 맨 위 "오늘의 목표" 칸들 — 이 연습이 언제 끝나는지를 단계 번호 대신 학습 목표로 말한다

/**
 * 예전에 이 자리에는 4단계 로드맵(`StepRail`)이 있었다. 그 레일은 **조작을 셌기 때문에** 손절을 겪는
 * 순간에도 "3 지켜보기"라고 말했고, 같은 순간 다른 곳의 번호와 어긋나기까지 했다. 이 화면이 가르치려는
 * 것은 조작이 아니라 "규칙이 대신 팔아 준다"는 경험이므로, 진행감은 **겪었는가**로만 센다.
 *
 * 원래 `ExitJourneyGuide` 맨 아래에 묻혀 있어 스크롤해야 보였다. 끝나는 조건이 화면에서 가장 늦게
 * 보이면 "내가 뭘 한 거고 언제 끝나는 거지"가 된다 — 그래서 맨 위로 올렸다. 칸 수는 시장마다
 * 다르다 — 코인은 시장가·지정가·손절익절 세 칸, 주식은 사보기·팔아보기 두 칸이다(호출부 참고).
 */
export interface TutorialGoal {
  label: string
  done: boolean
}

/** 이 시간 이하로 남으면 카운트다운을 경고색으로 바꾼다. */
const SALE_URGENT_MS = 60_000

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function TutorialGoalRail({
  goals,
  summary,
  saleRemainingMs,
}: {
  goals: TutorialGoal[]
  /** 끝을 한 문장으로. "언제 끝나는지"는 짐작하게 두지 않고 문장으로 못박는다. */
  summary: string
  /**
   * 매도 마감까지 남은 시간. **별도 블록으로 한 줄을 차지하지 않고 이 줄에 흡수한다** — 마감은
   * 목표와 같은 종류의 정보("언제 끝나는가")라 두 줄로 나누면 같은 질문에 두 번 답하는 셈이 된다.
   * 마감이 없는 실행(코인 대본)에서는 `null`이라 아무것도 그리지 않는다.
   */
  saleRemainingMs: number | null
}) {
  const allDone = goals.every((goal) => goal.done)
  const urgent = saleRemainingMs !== null && saleRemainingMs <= SALE_URGENT_MS

  return (
    <section aria-label="오늘의 목표" className="rounded-2xl border border-line bg-elevated/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-xs font-medium text-ink">오늘의 목표</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {goals.map((goal) => (
            <span
              key={goal.label}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                goal.done ? 'border-gain/40 bg-gain/10 text-gain' : 'border-line bg-elevated text-muted'
              }`}
            >
              {goal.done ? '✓ ' : ''}
              {goal.label}
            </span>
          ))}
        </div>
        {/* "둘 다"라고 못박지 않는다 — 코인은 목표가 세 칸이라 칸 수를 세지 않고도 맞는 말만 쓴다. */}
        <p className="text-[11px] text-muted">
          {allDone ? '다 채웠습니다 — 이제 마무리할 수 있어요' : '다 채우면 끝납니다'}
        </p>
        {saleRemainingMs !== null && (
          <p className={`text-[11px] ${urgent ? 'text-loss' : 'text-muted'}`}>
            <span className="tabular font-medium">{formatMmSs(saleRemainingMs)}</span> 안에 파는 연습입니다
          </p>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{summary}</p>
    </section>
  )
}
