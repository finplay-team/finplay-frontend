// 대본이 공개한 가상 사건과 지금 이야기가 진행 중인지를 차트 요약 바로 아래에 그리는 패널
import { useEffect, useRef, useState } from 'react'
import type {
  PracticeScenarioEventResponse,
  ScenarioCauseStatus,
  ScenarioStage,
} from '../../services/tutorialTypes'
import type { Market } from '../../services/types'

/** 새로 들어온 사건에 도착 표시를 남겨 두는 시간. 애니메이션(560ms)보다 길게 잡아 겹치지 않게 한다. */
const FRESH_MS = 900

/**
 * **막 번호를 화면에 쓰지 않는다.** 서버는 act 단위로 구간을 주지만 "4막 중 2막"처럼 그리면 이야기가
 * 얼마나 남았는지를 알려 주게 되어, 결말을 감추려는 이 기능의 목적과 어긋난다. 화면에는 진행 중인지
 * 아닌지와 끝났는지만 쓴다.
 */
function stateText(stage: ScenarioStage, progressing: boolean | null): string {
  if (stage === 'FINISHED') return '이야기가 끝났습니다'
  return progressing ? '이야기가 진행 중입니다' : '다음 움직임을 기다리는 중입니다'
}

/**
 * ⚠️ **`NONE_KNOWN`은 언제나 이 한 문구로만 그린다.** "아직 밝혀지지 않았다"와 "원래 원인이 없다"를
 * 구분해 보여주면 "곧 뉴스가 뜬다"는 신호가 되어, 이 기능이 막으려던 스포일러가 된다(SCENARIO-015·016).
 * 2막 중간의 속임수 반등이 여기 해당하는데 **원인 없이 잠깐 오르는 것을 그대로 보여주는 것이 그 구간의
 * 교육 목적**이므로, "저가 매수세 유입" 같은 문구를 임의로 붙이면 안 된다.
 */
function causeText(causeStatus: ScenarioCauseStatus | null): string | null {
  if (causeStatus === null) return null
  return causeStatus === 'REVEALED' ? '원인이 밝혀졌습니다' : '알려진 원인 없음'
}

/**
 * 사건에는 시각이 없다(서버의 이야기 시계와 화면 시계가 달라 숫자를 주면 틀린다). 배열 순서만 믿고
 * 상대 표현으로 쓴다 — "12분 전" 같은 숫자를 만들지 않는다.
 *
 * 방금 도착한 것만 "방금"이라고 부른다. 완료한 실습을 다시 열었을 때 맨 위 사건이 "방금"이면 거짓말이
 * 되므로, 그때는 "가장 최근"으로 부른다.
 */
function whenText(index: number, fresh: boolean): string {
  if (fresh) return '방금'
  return index === 0 ? '가장 최근' : '그 전에'
}

export function ScenarioEventPanel({
  market,
  stage,
  progressing,
  causeStatus,
  events,
}: {
  market: Market
  stage: ScenarioStage
  progressing: boolean | null
  causeStatus: ScenarioCauseStatus | null
  events: PracticeScenarioEventResponse[]
}) {
  /** 이번 갱신에서 새로 들어온 사건 수. 목록은 최신이 위라 앞에서부터 이만큼이 새 사건이다. */
  const [freshCount, setFreshCount] = useState(0)
  // 처음 그릴 때는 애니메이션을 돌리지 않는다 — 화면에 다시 들어온 것뿐인데 전부 새로 온 것처럼 보인다.
  const seenCountRef = useRef(events.length)

  useEffect(() => {
    const added = events.length - seenCountRef.current
    seenCountRef.current = events.length
    if (added <= 0) return
    setFreshCount(added)
    const timer = setTimeout(() => setFreshCount(0), FRESH_MS)
    return () => clearTimeout(timer)
  }, [events.length])

  const cause = causeText(causeStatus)
  const finished = stage === 'FINISHED'
  const live = !finished && progressing === true
  const accentDot = market === 'CRYPTO' ? 'bg-coin' : 'bg-brand'
  // 서버가 주는 순서는 오래된 것 → 최근이다. 화면은 최신이 위로 오게 뒤집어 그린다.
  const newestFirst = [...events].reverse()

  return (
    // 차트 카드 안, 요약 줄 바로 아래에 얹는다 — 캔들 설명 아코디언보다 먼저 눈에 들어와야 스크롤
    // 없이 보인다(2026-08-20 피드백). 카드를 새로 두르지 않고 위 구분선만으로 절을 가른다.
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">지금 무슨 일이</h3>
        {/*
          문구의 [연습] 접두와 별개로 배지를 유지한다 — 접두는 캡처해 나갔을 때를 위한 것이고,
          배지는 화면 안에서 이 목록 전체가 가상임을 한 번에 알리는 자리다.
        */}
        <span className="rounded-full border border-line bg-elevated px-2.5 py-1 text-[11px] text-muted">
          교육용 가상 사건
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-elevated/60 px-3.5 py-3">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 flex-none rounded-full ${live ? `${accentDot} animate-pulse-soft` : 'bg-white/25'}`}
        />
        <p className="text-sm text-ink">
          {stateText(stage, progressing)}
          {cause !== null && !finished && <span className="text-muted"> · {cause}</span>}
        </p>
      </div>

      {newestFirst.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          아직 공개된 사건이 없습니다. 값이 움직이는 이유가 밝혀지면 여기에 하나씩 쌓입니다.
        </p>
      ) : (
        <ul aria-live="polite" className="mt-3 space-y-2">
          {newestFirst.map((event, index) => {
            const fresh = index < freshCount
            return (
              <li
                // 같은 문구가 두 번 공개되는 대본은 없지만, 있더라도 순서가 섞이지 않게 index를 함께 쓴다.
                key={`${event.stage}-${event.headline}-${index}`}
                className={`rounded-2xl border border-line bg-elevated px-3.5 py-3 ${fresh ? 'event-arrive' : ''}`}
              >
                <p className={`text-[11px] font-medium ${fresh ? 'text-ink' : 'text-muted'}`}>
                  {whenText(index, fresh)}
                </p>
                {/* headline은 그대로 출력한다 — [연습] 접두를 떼면 캡처된 화면에서 가상임이 사라진다. */}
                <p className="mt-1 text-sm leading-relaxed text-ink">{event.headline}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * 완료 결과 모달 안에 들어가는 요약형. 패널과 달리 상태 줄이 없고 공개 순서 그대로(오래된 것 → 최근)
 * 눕혀 그린다 — 끝난 뒤에는 "방금"이 의미가 없고 이야기 순서로 읽는 편이 복기에 맞다.
 */
export function ScenarioEventSummary({ events }: { events: PracticeScenarioEventResponse[] }) {
  if (events.length === 0) return null
  return (
    <div className="border-t border-line pt-4">
      <p className="text-xs text-muted">이 연습에서 공개된 사건</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {events.map((event, index) => (
          <li
            key={`${event.stage}-${event.headline}-${index}`}
            className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs text-muted"
          >
            {event.headline}
          </li>
        ))}
      </ul>
      {/* 공개되지 않은 사건은 완료 뒤에도 노출하지 않는다(SCENARIO-020) — 그 사실만 밝혀 둔다. */}
      <p className="mt-2 text-[11px] text-muted">공개되지 않은 사건은 끝난 뒤에도 보여주지 않습니다.</p>
    </div>
  )
}
