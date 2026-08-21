// 토스트 큐의 중복 방지·자동 소멸·구독 해제를 고정하는 테스트
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, getToasts, showToast, subscribeToasts } from './toastBus'

/** 모듈 스코프 상태라 테스트 사이에 남는다 — 매번 비우고 시작한다. */
function clearAll(): void {
  for (const toast of [...getToasts()]) dismissToast(toast.id)
}

beforeEach(() => {
  vi.useFakeTimers()
  clearAll()
})

afterEach(() => {
  clearAll()
  vi.useRealTimers()
})

describe('showToast', () => {
  it('띄운 토스트가 톤·문구 그대로 목록에 들어간다', () => {
    showToast({ tone: 'success', text: '매수가 완료됐습니다' })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]).toMatchObject({ tone: 'success', text: '매수가 완료됐습니다' })
  })

  it('key가 없으면 같은 문구라도 매번 새로 쌓인다', () => {
    showToast({ tone: 'neutral', text: '같은 문구' })
    showToast({ tone: 'neutral', text: '같은 문구' })

    expect(getToasts()).toHaveLength(2)
  })

  it('3초마다 같은 key로 20번 불러도 화면에는 하나만 남는다', () => {
    const first = () => getToasts()[0]

    for (let i = 0; i < 20; i += 1) {
      showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-filled-7' })
      vi.advanceTimersByTime(3000)
      // 중복 호출이 타이머를 미루므로 3초 간격 폴링 내내 끊기지 않고 하나가 유지된다.
      expect(getToasts()).toHaveLength(1)
    }

    const survivor = first()
    expect(survivor.text).toBe('매수가 완료됐습니다')

    // 감지가 멎으면 마지막으로 미뤄 둔 시간이 지나 사라진다.
    vi.advanceTimersByTime(4000)
    expect(getToasts()).toHaveLength(0)
  })

  it('key가 다르면 따로 쌓인다', () => {
    showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-1' })
    showToast({ tone: 'success', text: '매도가 완료됐습니다', key: 'sell-1' })

    expect(getToasts()).toHaveLength(2)
  })

  it('같은 key라도 앞의 토스트가 사라진 뒤에는 다시 뜬다', () => {
    showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-1' })
    vi.advanceTimersByTime(4000)
    expect(getToasts()).toHaveLength(0)

    showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-1' })
    expect(getToasts()).toHaveLength(1)
  })
})

describe('자동 소멸', () => {
  it('성공·중립은 4초 뒤 사라진다', () => {
    showToast({ tone: 'success', text: '매수가 완료됐습니다' })
    showToast({ tone: 'neutral', text: '주문을 접수했습니다' })

    vi.advanceTimersByTime(3999)
    expect(getToasts()).toHaveLength(2)

    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('경고는 성공보다 오래 남는다', () => {
    showToast({ tone: 'warning', text: '잔고가 부족합니다' })

    vi.advanceTimersByTime(4000)
    expect(getToasts()).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(getToasts()).toHaveLength(0)
  })
})

describe('dismissToast', () => {
  it('id로 지정한 토스트만 지운다', () => {
    showToast({ tone: 'success', text: '첫째' })
    showToast({ tone: 'success', text: '둘째' })
    const [first] = getToasts()

    dismissToast(first.id)

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].text).toBe('둘째')
  })

  it('이미 사라진 id를 다시 지워도 아무 일도 없다', () => {
    showToast({ tone: 'success', text: '하나' })
    const [only] = getToasts()

    dismissToast(only.id)
    expect(() => dismissToast(only.id)).not.toThrow()
    expect(getToasts()).toHaveLength(0)
  })

  it('직접 닫으면 남은 타이머가 뒤늦게 다시 알리지 않는다', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToasts(listener)
    showToast({ tone: 'success', text: '하나' })
    dismissToast(getToasts()[0].id)
    const callsAfterDismiss = listener.mock.calls.length

    vi.advanceTimersByTime(10000)

    expect(listener.mock.calls).toHaveLength(callsAfterDismiss)
    unsubscribe()
  })
})

describe('구독', () => {
  it('토스트가 뜨고 사라질 때 구독자에게 알린다', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToasts(listener)

    showToast({ tone: 'success', text: '하나' })
    expect(listener).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4000)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('구독을 해제하면 더 이상 알리지 않는다', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToasts(listener)

    unsubscribe()
    showToast({ tone: 'success', text: '하나' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('중복이라 무시된 호출은 목록을 바꾸지 않으므로 알리지 않는다', () => {
    showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-1' })
    const listener = vi.fn()
    const unsubscribe = subscribeToasts(listener)

    showToast({ tone: 'success', text: '매수가 완료됐습니다', key: 'buy-1' })

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('목록이 그대로면 getToasts가 같은 참조를 돌려준다 (useSyncExternalStore 무한 렌더 방지)', () => {
    showToast({ tone: 'success', text: '하나' })

    expect(getToasts()).toBe(getToasts())
  })
})
