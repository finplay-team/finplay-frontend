// 튜토리얼 진행 상태가 바뀌었음을 화면 간에 알리는 모듈 스코프 신호 (accountPulse.ts 와 같은 패턴)
//
// 관찰·복기·의도 기록이 성공하면 진행 상태가 바뀌는데, Tutorial 페이지 밖의 다른 구독자는
// 그 사실을 모른다. 상태를 바꾼 쪽이 한 번 알리고 구독자가 그때만 다시 읽는다.

let revision = 0
const listeners = new Set<() => void>()

/** 즐겨찾기·의도 기록·관찰·복기 성공 직후에 호출한다. */
export function bumpTutorial(): void {
  revision += 1
  for (const listener of listeners) listener()
}

export function subscribeTutorial(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTutorialRevision(): number {
  return revision
}
