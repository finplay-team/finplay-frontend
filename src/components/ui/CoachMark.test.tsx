// 코치마크가 대상을 찾았을 때만 말풍선을 그리고, 닫기(X·Esc)를 부모에게 알리는지 검증한다
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoachMark, forgetCoachMark, hasSeenCoachMark, markCoachMarkSeen } from './CoachMark'

const TITLE = '지금 값이 어디서든 따라다녀요'
const BODY = '아래로 내려도 이 줄은 계속 붙어 있어요.'

let host: HTMLDivElement | null = null

/** 화면 안에 보이는 대상 하나를 문서에 붙인다. */
function appendTarget(name = 'price-bar') {
  host = document.createElement('div')
  host.dataset.coach = name
  host.textContent = '대상'
  document.body.appendChild(host)
}

/** jsdom 의 getBoundingClientRect 는 전부 0 을 준다 — 실제 숫자 위에서 위치 계산이 돌게 한다. */
function mockRect(rect: Partial<DOMRect>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 200,
    left: 40,
    right: 360,
    bottom: 250,
    width: 320,
    height: 50,
    x: 40,
    y: 200,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect)
}

function renderMark(props: Partial<Parameters<typeof CoachMark>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <CoachMark target="price-bar" title={TITLE} body={BODY} active onClose={onClose} {...props} />,
  )
  return onClose
}

describe('CoachMark', () => {
  beforeEach(() => {
    localStorage.clear()
    mockRect({})
  })

  afterEach(() => {
    vi.useRealTimers()
    host?.remove()
    host = null
    vi.restoreAllMocks()
  })

  it('대상이 있으면 제목·본문과 이름 붙은 닫기 버튼을 보여준다', () => {
    appendTarget()
    renderMark()

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()
    expect(screen.getByText(BODY)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '안내 닫기' })).toBeInTheDocument()
  })

  it('대상 요소가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <CoachMark target="price-bar" title={TITLE} body={BODY} active onClose={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('active=false 면 대상이 있어도 그리지 않는다', () => {
    appendTarget()
    const { container } = render(
      <CoachMark target="price-bar" title={TITLE} body={BODY} active={false} onClose={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('대상이 화면 밖으로 지나가면 말풍선도 사라진다', async () => {
    // 화면 밖 대상을 그대로 따라가면 말풍선이 뷰포트 밖에 그려져 "안내가 안 뜬다"로 보인다.
    appendTarget()
    vi.useFakeTimers()
    renderMark()
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()

    mockRect({ top: window.innerHeight + 40, bottom: window.innerHeight + 90 })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('닫기 버튼과 Esc 가 모두 onClose 를 부른다', () => {
    appendTarget()
    const onClose = renderMark()

    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('언마운트하면 keydown·scroll·resize 리스너를 해제한다', () => {
    appendTarget()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const onClose = vi.fn()
    const view = render(
      <CoachMark target="price-bar" title={TITLE} body={BODY} active onClose={onClose} />,
    )

    view.unmount()

    const removed = removeSpy.mock.calls.map(([type]) => type)
    expect(removed).toContain('keydown')
    expect(removed).toContain('scroll')
    expect(removed).toContain('resize')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('본 기록 헬퍼는 저장·조회·삭제를 같은 키로 처리한다', () => {
    expect(hasSeenCoachMark('finplay.coach.test')).toBe(false)

    markCoachMarkSeen('finplay.coach.test')
    expect(hasSeenCoachMark('finplay.coach.test')).toBe(true)

    forgetCoachMark('finplay.coach.test')
    expect(hasSeenCoachMark('finplay.coach.test')).toBe(false)
  })
})
