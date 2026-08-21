// 토스트 뷰포트의 렌더·접근성 속성·직접 닫기를 고정하는 테스트
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastViewport } from './ToastViewport'
import { dismissToast, getToasts, showToast } from '../../lib/toastBus'

function clearAll(): void {
  act(() => {
    for (const toast of [...getToasts()]) dismissToast(toast.id)
  })
}

beforeEach(clearAll)
afterEach(clearAll)

describe('ToastViewport', () => {
  it('토스트가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<ToastViewport />)

    expect(container).toBeEmptyDOMElement()
  })

  it('띄운 토스트의 문구를 상단에 보여준다', () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ tone: 'success', text: '매수가 완료됐습니다' })
    })

    expect(screen.getByText('매수가 완료됐습니다')).toBeInTheDocument()
  })

  it('여러 개면 띄운 순서대로 쌓인다', () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ tone: 'success', text: '매수가 완료됐습니다' })
      showToast({ tone: 'success', text: '매도가 완료됐습니다' })
    })

    const texts = screen.getAllByRole('status').map((node) => node.textContent)
    expect(texts[0]).toContain('매수가 완료됐습니다')
    expect(texts[1]).toContain('매도가 완료됐습니다')
  })

  it('성공은 polite로, 경고는 assertive로 읽힌다', () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ tone: 'success', text: '매수가 완료됐습니다' })
      showToast({ tone: 'warning', text: '잔고가 부족합니다' })
    })

    const [success, warning] = screen.getAllByRole('status')
    expect(success).toHaveAttribute('aria-live', 'polite')
    expect(warning).toHaveAttribute('aria-live', 'assertive')
  })

  it('닫기 버튼을 누르면 그 토스트만 사라진다', async () => {
    const user = userEvent.setup()
    render(<ToastViewport />)

    act(() => {
      showToast({ tone: 'success', text: '매수가 완료됐습니다' })
      showToast({ tone: 'success', text: '매도가 완료됐습니다' })
    })

    await user.click(screen.getAllByRole('button', { name: '알림 닫기' })[0])

    expect(screen.queryByText('매수가 완료됐습니다')).not.toBeInTheDocument()
    expect(screen.getByText('매도가 완료됐습니다')).toBeInTheDocument()
  })

  it('시간이 지나면 저절로 사라진다', () => {
    vi.useFakeTimers()
    try {
      render(<ToastViewport />)
      act(() => {
        showToast({ tone: 'success', text: '매수가 완료됐습니다' })
      })
      expect(screen.getByText('매수가 완료됐습니다')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(4000)
      })

      expect(screen.queryByText('매수가 완료됐습니다')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('언마운트하면 구독이 끊겨 이후 토스트에 반응하지 않는다', () => {
    const { unmount } = render(<ToastViewport />)
    unmount()

    act(() => {
      showToast({ tone: 'success', text: '매수가 완료됐습니다' })
    })

    expect(screen.queryByText('매수가 완료됐습니다')).not.toBeInTheDocument()
  })
})
