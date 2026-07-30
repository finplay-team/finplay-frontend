// 잔고·보유가 바뀌었음을 화면 간에 알리는 모듈 스코프 신호 (React 비의존, useSyncExternalStore 계약)
//
// 주문이 체결되면 잔고와 보유가 함께 바뀌는데, 이 사실을 아는 곳은 주문을 낸 화면뿐이다.
// 상단 내비의 지갑처럼 다른 곳에 있는 소비자는 알 방법이 없어 낡은 값을 계속 보여준다.
// 시세는 SSE로 오지만 잔고는 스트림에 실려오지 않으므로 직접 다시 읽어야 한다.
// 폴링을 도입하는 대신, 잔고를 바꾼 쪽이 한 번 알리고 구독자가 그때만 다시 읽는다.
//
// getSnapshot이 원시값(number)을 반환하므로 useSyncExternalStore의 참조 동일성 문제가 없다.

let revision = 0
const listeners = new Set<() => void>()

/** 주문 체결처럼 잔고·보유를 바꾼 직후에 호출한다. */
export function bumpAccount(): void {
  revision += 1
  for (const listener of listeners) listener()
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAccountRevision(): number {
  return revision
}
