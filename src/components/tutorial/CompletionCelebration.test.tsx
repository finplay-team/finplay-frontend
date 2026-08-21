// 완료 축하 모달의 시장별 문구·금액 연출·닫기 경로·포커스 이동을 DOM에서 검증한다.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PracticeEntryResponse } from '../../services/tutorialTypes'
import type { Market } from '../../services/types'
import { CompletionCelebration } from './CompletionCelebration'

interface Props {
  open: boolean
  market: Market
  rewardAmount: number | null
  entries?: PracticeEntryResponse[]
  celebrate?: boolean
  onClose: () => void
}

function modal(props: Partial<Props>, onClose: () => void) {
  return (
    <MemoryRouter>
      <CompletionCelebration open market="STOCK" rewardAmount={5_000_000} onClose={onClose} {...props} />
    </MemoryRouter>
  )
}

function renderModal(props: Partial<Props> = {}) {
  const onClose = vi.fn()
  return { onClose, view: render(modal(props, onClose)) }
}

/**
 * 금액이 span으로 쪼개져 있어 문장 전체는 <p>의 textContent로만 비교할 수 있다.
 * 줄바꿈·들여쓰기가 섞이므로 공백은 하나로 정규화해 비교한다.
 */
function paragraph(matches: (text: string) => boolean) {
  return (_content: string, element: Element | null) =>
    element?.tagName === 'P' && matches((element.textContent ?? '').replace(/\s+/g, ' ').trim())
}

/** rAF를 가로챈 상태에서 지금까지 예약된 프레임을 주어진 시각으로 한 번에 흘려보낸다. */
function drain(frames: FrameRequestCallback[], now: number) {
  const pending = frames.splice(0, frames.length)
  act(() => {
    pending.forEach((frame) => frame(now))
  })
}

describe('CompletionCelebration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    renderModal({ open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('주식 시장이면 주식용 자금이라고 말한다', () => {
    renderModal({ market: 'STOCK' })

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('주식 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(
      screen.getByText(paragraph((text) => text === '축하합니다. 주식용 자금 5,000,000원이 계좌에 들어왔습니다.')),
    ).toBeInTheDocument()
  })

  it('코인 시장이면 코인용 자금이라고 말한다', () => {
    renderModal({ market: 'CRYPTO' })

    expect(screen.getByText('코인 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(
      screen.getByText(paragraph((text) => text === '축하합니다. 코인용 자금 5,000,000원이 계좌에 들어왔습니다.')),
    ).toBeInTheDocument()
  })

  it('금액을 모르면 금액 문장을 아예 쓰지 않는다', () => {
    // 없는 금액을 지어내지 않는다 — 완료 문장만 남는다.
    renderModal({ rewardAmount: null })

    expect(screen.getByText('주식 시장의 실습을 완료했습니다')).toBeInTheDocument()
    expect(screen.queryByText(paragraph((text) => text.includes('자금')))).not.toBeInTheDocument()
  })

  it('닫기 버튼·Esc·배경 클릭 어느 쪽으로도 닫히고 모달 안 클릭으로는 닫히지 않는다', () => {
    const { onClose, view } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    // 모달 내부 클릭은 배경까지 올라가도 닫지 않는다(카드 위 실수 클릭으로 축하가 사라지면 안 된다).
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)

    const backdrop = view.container.querySelector('.fixed.inset-0')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop as Element)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('2차 버튼으로 모달만 닫고 완료 기록으로 돌아갈 수 있다', () => {
    const { onClose } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: '완료 기록 보기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('1차 행동은 실전 거래로 나가는 링크다', () => {
    renderModal()

    expect(screen.getByRole('link', { name: '실전 거래 시작하기' })).toHaveAttribute('href', '/trade')
  })

  it('열릴 때 포커스를 모달로 옮기고 닫히면 원래 자리로 돌려준다', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const onClose = vi.fn()
    const view = render(modal({}, onClose))
    expect(screen.getByRole('dialog')).toHaveFocus()

    view.rerender(modal({ open: false }, onClose))
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('애니메이션 축소를 선호하지 않으면 금액이 0에서 목표값까지 올라간다', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    )
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
      frames.push(frame)
      return frames.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    vi.spyOn(performance, 'now').mockReturnValue(0)

    const { view } = renderModal()
    expect(screen.getByText('0원')).toBeInTheDocument()

    drain(frames, 500)
    expect(screen.queryByText('5,000,000원')).not.toBeInTheDocument()

    drain(frames, 1000)
    expect(screen.getByText('5,000,000원')).toBeInTheDocument()

    // 언마운트 시 예약된 프레임을 취소한다.
    view.unmount()
    expect(cancel).toHaveBeenCalled()
  })

  it('matchMedia가 없는 환경에서는 연출 없이 최종 금액을 바로 보여준다', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    renderModal()

    expect(screen.getByText('5,000,000원')).toBeInTheDocument()
    expect(requestFrame).not.toHaveBeenCalled()
  })

  it('진입 카드가 있으면 결과를 함께 펼치고, 다시 볼 때는 축하하지 않는다', () => {
    const entry: PracticeEntryResponse = {
      entrySequence: 1,
      exitPreset: 'BALANCED',
      buyOrderType: 'MARKET',
      buyAt: '2026-08-20T11:00:00',
      buyPrice: 12400,
      buyQuantity: 40,
      stopLossPrice: 12028,
      takeProfitPrice: 12772,
      sellPrice: 12030,
      sellQuantity: 40,
      sellAt: '2026-08-20T11:12:00',
      sellCause: 'STOP_LOSS',
      realizedPnl: -15860,
      unrealizedPnlIfHeld: 38200,
    }
    renderModal({ entries: [entry], celebrate: false })

    expect(screen.getByText('1번째 진입')).toBeInTheDocument()
    // 보상 문장 자체는 남기되 "축하합니다"는 최초 완료 순간에만 붙는다.
    expect(screen.getByText('5,000,000원')).toBeInTheDocument()
    expect(screen.queryByText(/축하합니다/)).not.toBeInTheDocument()
  })

  it('한 다이얼로그 안에 같은 이름의 버튼을 두지 않는다', () => {
    renderModal()

    // X 버튼이 aria-label="닫기"라, 아래 버튼까지 "닫기"면 스크린리더가 구분하지 못한다.
    expect(screen.getAllByRole('button', { name: '닫기' })).toHaveLength(1)
  })
})
