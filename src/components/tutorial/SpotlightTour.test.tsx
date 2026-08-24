// 스포트라이트 안내가 대상 탐색·단계 이동·종료 기록 규칙대로 동작하는지 DOM에서 검증한다.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpotlightTour, type SpotlightStep } from './SpotlightTour'

const STORAGE_KEY = 'finplay.tour.spotlight-test'

const steps: SpotlightStep[] = [
  { target: 'instrument', title: '먼저 종목을 고르세요', body: '무엇을 사고팔지 정하는 첫 단계입니다.' },
  { target: 'buy', title: '여기가 매수 버튼입니다', body: '고른 종목을 사려면 이 버튼을 누릅니다.' },
]

let host: HTMLDivElement | null = null
const originalScrollIntoView = Element.prototype.scrollIntoView

/** data-tour 를 단 대상 요소들을 문서에 붙인다. 이름 순서대로 버튼 하나씩 만든다. */
function mountTargets(names: string[]) {
  host = document.createElement('div')
  document.body.appendChild(host)
  names.forEach(appendTarget)
}

function renderTour(active = true, current: SpotlightStep[] = steps) {
  return render(<SpotlightTour steps={current} storageKey={STORAGE_KEY} active={active} />)
}

/** 종목 선택 → 서버 응답 후 수량·매수 카드가 마운트되는 실제 흐름을 흉내 내기 위한 3단계 구성. */
const threeSteps: SpotlightStep[] = [
  { target: 'instrument', title: '먼저 종목을 고르세요', body: '무엇을 사고팔지 정하는 첫 단계입니다.' },
  { target: 'quantity', title: '몇 개를 살지 정하세요', body: '가진 돈 안에서 수량을 적습니다.' },
  { target: 'buy', title: '여기가 매수 버튼입니다', body: '고른 종목을 사려면 이 버튼을 누릅니다.' },
]

function appendTarget(name: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.tour = name
  button.textContent = `대상 ${name}`
  host?.appendChild(button)
}

describe('SpotlightTour', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom 에는 scrollIntoView 가 없다. 컴포넌트가 존재를 확인하고 부르지만, 실제 호출 경로도 검증하려고 넣는다.
    Element.prototype.scrollIntoView = vi.fn()
    // jsdom 의 getBoundingClientRect 는 전부 0 을 준다 — 위치 계산이 실제 숫자 위에서 돌게 화면 안 좌표를 준다.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 40,
      right: 160,
      bottom: 240,
      width: 120,
      height: 40,
      x: 40,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    vi.useRealTimers()
    Element.prototype.scrollIntoView = originalScrollIntoView
    host?.remove()
    host = null
    vi.restoreAllMocks()
  })

  it('active=false 면 아무것도 렌더하지 않는다', () => {
    mountTargets(['instrument', 'buy'])
    const { container } = renderTour(false)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('localStorage 에 이미 본 기록이 있으면 렌더하지 않는다', () => {
    mountTargets(['instrument', 'buy'])
    localStorage.setItem(STORAGE_KEY, 'done')
    renderTour()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(steps[0].title)).not.toBeInTheDocument()
  })

  it('본 기록을 지우고 key 로 리마운트하면 이미 본 안내도 처음 단계부터 다시 뜬다', () => {
    // "안내 다시 보기"가 기대는 성질이다 — dismissed 초기값이 마운트 시점의 localStorage 라서
    // 키만 지우고 그대로 두면 화면은 바뀌지 않는다.
    mountTargets(['instrument', 'buy'])
    localStorage.setItem(STORAGE_KEY, 'done')
    const view = render(<SpotlightTour key="1" steps={steps} storageKey={STORAGE_KEY} active />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    localStorage.removeItem(STORAGE_KEY)
    view.rerender(<SpotlightTour key="2" steps={steps} storageKey={STORAGE_KEY} active />)

    expect(screen.getByRole('dialog', { name: '화면 사용법 안내' })).toBeInTheDocument()
    expect(screen.getByText(steps[0].title)).toBeInTheDocument()
  })

  it('대상이 있으면 첫 단계의 제목과 본문을 보여준다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    const dialog = screen.getByRole('dialog', { name: '화면 사용법 안내' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(steps[0].body)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '안내 끄기' })).toBeInTheDocument()
  })

  it('"다음"을 누르면 두 번째 단계로 넘어간다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText(steps[1].title)).toBeInTheDocument()
    expect(screen.getByText(steps[1].body)).toBeInTheDocument()
    expect(screen.queryByText(steps[0].title)).not.toBeInTheDocument()
  })

  it('"이전"을 누르면 앞 단계로 돌아간다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText(steps[1].title)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '이전' }))

    expect(screen.getByText(steps[0].title)).toBeInTheDocument()
    expect(screen.queryByText(steps[1].title)).not.toBeInTheDocument()
  })

  it('첫 단계에서는 "이전" 버튼을 보여주지 않는다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument()
  })

  it('종목을 고른 뒤 목록이 사라지면(실제 화면과 같은 흐름) "이전"을 보여주지 않는다', async () => {
    // sync()의 앞쪽 탐색(findTarget)처럼 뒤쪽 탐색도 없는 대상을 건너뛰지 않으면, "이전"을 눌러도
    // 제자리로 되튕겨 아무 일도 안 하는 것처럼 보인다 — 그래서 갈 곳이 없으면 버튼 자체를 감춘다.
    mountTargets(['instrument'])
    vi.useFakeTimers()
    renderTour(true, threeSteps)

    fireEvent.click(screen.getByRole('button', { name: '대상 instrument' }))
    document.querySelector('[data-tour="instrument"]')?.remove()
    appendTarget('quantity')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByText(threeSteps[1].title)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument()
  })

  it('대상 요소를 직접 클릭해도 다음 단계로 넘어간다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    fireEvent.click(screen.getByRole('button', { name: '대상 instrument' }))

    expect(screen.getByText(steps[1].title)).toBeInTheDocument()
  })

  it('"안내 끄기"를 누르면 사라지고 localStorage 에 기록된다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    fireEvent.click(screen.getByRole('button', { name: '안내 끄기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('Esc 를 누르면 즉시 종료하고 기록을 남긴다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('마지막 단계를 마치면 종료하고 기록을 남긴다', () => {
    mountTargets(['instrument', 'buy'])
    renderTour()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '안내 마치기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('대상 요소가 없는 단계는 건너뛴다', () => {
    mountTargets(['buy'])
    renderTour()

    expect(screen.getByText(steps[1].title)).toBeInTheDocument()
    expect(screen.queryByText(steps[0].title)).not.toBeInTheDocument()
  })

  it('보고 있던 단계의 대상이 잠시 사라져도 뒤 단계로 건너뛰지 않고 돌아오길 기다린다', async () => {
    // 단계별 카드가 나타났다 접히는 화면이라, 현재 대상이 잠깐 없어졌다고 뒤 단계로 넘어가면 안 된다.
    mountTargets(['instrument', 'buy'])
    vi.useFakeTimers()
    renderTour()
    expect(screen.getByText(steps[0].title)).toBeInTheDocument()

    document.querySelector('[data-tour="instrument"]')?.remove()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText(steps[1].title)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    appendTarget('instrument')
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(steps[0].title)).toBeInTheDocument()
  })

  it('단계 전환 직후 대상이 아직 없으면 유예 동안 기다렸다가 늦게 뜬 대상을 잡는다', async () => {
    // 종목을 고르면 그 카드가 사라지고, 수량·매수 카드는 서버 응답 뒤에야 마운트된다 —
    // 그 사이 뒤 단계(buy) 대상이 먼저 보여도 수량 단계를 건너뛰면 안 된다.
    mountTargets(['instrument'])
    vi.useFakeTimers()
    renderTour(true, threeSteps)
    expect(screen.getByText(threeSteps[0].title)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '대상 instrument' }))
    document.querySelector('[data-tour="instrument"]')?.remove()
    appendTarget('buy')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByText(threeSteps[2].title)).not.toBeInTheDocument()

    appendTarget('quantity')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByText(threeSteps[1].title)).toBeInTheDocument()
  })

  it('유예가 지나도 대상이 없으면 그때 다음 단계로 건너뛴다', async () => {
    mountTargets(['instrument'])
    vi.useFakeTimers()
    renderTour(true, threeSteps)

    fireEvent.click(screen.getByRole('button', { name: '대상 instrument' }))
    document.querySelector('[data-tour="instrument"]')?.remove()
    appendTarget('buy')
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByText(threeSteps[2].title)).toBeInTheDocument()
    expect(screen.queryByText(threeSteps[1].title)).not.toBeInTheDocument()
  })

  it('모든 단계의 대상이 없으면 아무것도 렌더하지 않고 기록도 남기지 않는다', () => {
    const { container } = renderTour()

    expect(container).toBeEmptyDOMElement()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('최초 렌더에 대상이 하나도 없어도 나중에 뜨면 첫 단계부터 시작한다', async () => {
    // 종목 목록을 비동기로 받는 동안에는 어떤 data-tour 요소도 아직 없다.
    // 건너뛸 뒤 단계 대상조차 없으므로 단계를 넘기지 않고 기다렸다 1단계를 잡아야 한다.
    mountTargets([])
    vi.useFakeTimers()
    renderTour()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    appendTarget('instrument')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByText(steps[0].title)).toBeInTheDocument()
    expect(screen.queryByText(steps[1].title)).not.toBeInTheDocument()
  })

  it('언마운트하면 keydown 리스너를 해제해 이후 Esc 가 상태를 건드리지 않는다', () => {
    mountTargets(['instrument', 'buy'])
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const view = renderTour()

    view.unmount()

    const removed = removeSpy.mock.calls.map(([type]) => type)
    expect(removed).toContain('keydown')
    expect(removed).toContain('scroll')
    expect(removed).toContain('resize')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
