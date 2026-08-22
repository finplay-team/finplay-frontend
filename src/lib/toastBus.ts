// 화면 상단 알림(토스트)을 React 밖에서도 띄울 수 있게 하는 모듈 스코프 큐 (React 비의존, useSyncExternalStore 계약)
//
// 매수·매도 체결처럼 "방금 무슨 일이 일어났는지"를 알리는 자리다. 알리는 쪽(서비스 호출부,
// 3초마다 도는 폴링 루프)은 React 컴포넌트가 아닐 수 있으므로 tutorialPulse.ts 와 같은 모양의
// 모듈 스코프 pub/sub 으로 둔다. 구독자는 ToastViewport 하나뿐이다.

export type ToastTone = 'success' | 'warning' | 'neutral'

export interface Toast {
  id: number
  tone: ToastTone
  text: string
}

/**
 * 톤별로 화면에 머무는 시간. 성공·중립은 흘려보내도 되는 확인이라 짧게, 경고는 읽고 판단해야
 * 하는 내용이라 길게 잡는다.
 */
const DURATION_MS: Record<ToastTone, number> = {
  success: 4000,
  neutral: 4000,
  warning: 7000,
}

interface Entry extends Toast {
  /** 중복 방지용 식별자. 없으면 부를 때마다 새로 쌓인다. */
  key?: string
  timer: ReturnType<typeof setTimeout>
}

let nextId = 1
let entries: Entry[] = []
/**
 * getToasts 가 돌려주는 값. useSyncExternalStore 는 알림이 없는 동안 같은 참조가 나와야 하므로
 * 매 호출마다 새로 만들지 않고 변경 시점에만 다시 만든다.
 */
let snapshot: ReadonlyArray<Toast> = []
const listeners = new Set<() => void>()

function publish(): void {
  snapshot = entries.map(({ id, tone, text }) => ({ id, tone, text }))
  for (const listener of listeners) listener()
}

/**
 * 토스트를 하나 띄운다. React 밖에서도 부를 수 있다.
 *
 * `key` 를 주면 같은 key 의 토스트가 아직 떠 있는 동안에는 새로 쌓지 않고 그 토스트의 사라지는
 * 시각만 미룬다 — 튜토리얼 화면은 3초마다 상태를 다시 읽어서 같은 사건이 여러 tick 에 걸쳐
 * 감지되는데, 그때마다 쌓이면 같은 문장이 화면을 채운다. 감지가 멎으면 마지막으로 미뤄 둔
 * 시간이 지나 사라지고, 그 전에도 사용자가 직접 닫을 수 있다.
 */
export function showToast(input: { tone: ToastTone; text: string; key?: string }): void {
  if (input.key !== undefined) {
    const existing = entries.find((entry) => entry.key === input.key)
    if (existing) {
      clearTimeout(existing.timer)
      existing.timer = setTimeout(() => dismissToast(existing.id), DURATION_MS[existing.tone])
      return
    }
  }

  const id = nextId++
  entries = [
    ...entries,
    {
      id,
      tone: input.tone,
      text: input.text,
      key: input.key,
      timer: setTimeout(() => dismissToast(id), DURATION_MS[input.tone]),
    },
  ]
  publish()
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): ReadonlyArray<Toast> {
  return snapshot
}

/** 사용자가 X를 누르거나 시간이 지나 사라질 때. 없는 id는 조용히 무시한다(중복 호출 안전). */
export function dismissToast(id: number): void {
  const entry = entries.find((candidate) => candidate.id === id)
  if (entry === undefined) return
  clearTimeout(entry.timer)
  entries = entries.filter((candidate) => candidate.id !== id)
  publish()
}
