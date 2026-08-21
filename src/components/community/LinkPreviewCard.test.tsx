// 본문 속 링크를 도메인 미리보기 카드로 보여주는 LinkPreviewCard 를 검증한다
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinkPreviewCard } from './LinkPreviewCard'

describe('LinkPreviewCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('본문에 URL이 없으면 아무 것도 그리지 않는다', () => {
    const { container } = render(<LinkPreviewCard content="오늘도 좋은 하루였습니다." />)
    expect(container).toBeEmptyDOMElement()
  })

  it('host를 보여준다', () => {
    render(<LinkPreviewCard content="참고 https://example.com/post 확인해 주세요" />)
    expect(screen.getByText('example.com')).toBeInTheDocument()
  })

  it('유튜브 링크는 썸네일 이미지를 함께 그린다', () => {
    const { container } = render(<LinkPreviewCard content="https://youtu.be/MeGhLeqsmws" />)
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.youtube.com/vi/MeGhLeqsmws/hqdefault.jpg',
    )
  })

  it('일반 링크는 썸네일 이미지를 그리지 않는다', () => {
    const { container } = render(<LinkPreviewCard content="https://example.com" />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  /**
   * 목록에서는 카드 전체가 게시글 상세로 가는 Link 로 감싸여 있어, 클릭이 그 Link 로
   * 번지면 안 되고(stopPropagation) 대신 새 탭으로 링크를 직접 열어야 한다.
   */
  it('클릭하면 새 탭으로 링크를 열고, 클릭 이벤트가 상위로 번지지 않는다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onOuterClick = vi.fn()
    const user = userEvent.setup()

    render(
      <div onClick={onOuterClick}>
        <LinkPreviewCard content="https://example.com/post" />
      </div>,
    )

    await user.click(screen.getByRole('link'))

    expect(openSpy).toHaveBeenCalledWith('https://example.com/post', '_blank', 'noopener,noreferrer')
    expect(onOuterClick).not.toHaveBeenCalled()
  })

  it('Enter 키로도 링크를 연다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()

    render(<LinkPreviewCard content="https://example.com/post" />)
    screen.getByRole('link').focus()
    await user.keyboard('{Enter}')

    expect(openSpy).toHaveBeenCalledWith('https://example.com/post', '_blank', 'noopener,noreferrer')
  })
})
