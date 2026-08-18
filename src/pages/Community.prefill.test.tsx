// 수익 인증 카드에서 "커뮤니티에 바로 올리기"로 넘어올 때 글쓰기 폼이 이미지 첨부 상태로 자동으로 열리는지 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstruments } from '../hooks/useInstruments'
import {
  createPost,
  getPostImageBlobUrl,
  getPosts,
  uploadPostImage,
} from '../services/communityService'
import type { PostPage } from '../services/types'
import { Community } from './Community'

vi.mock('../services/communityService', () => ({
  getPosts: vi.fn(),
  createPost: vi.fn(),
  uploadPostImage: vi.fn(),
  getPostImageBlobUrl: vi.fn(),
}))
vi.mock('../hooks/useInstruments', () => ({
  useInstruments: vi.fn(),
}))

function emptyPage(): PostPage {
  return { content: [], page: 0, size: 10, totalElements: 0, totalPages: 1, hasNext: false }
}

describe('Community 진입 시 attachedImageId 프리필', () => {
  beforeEach(() => {
    vi.mocked(getPosts).mockResolvedValue(emptyPage())
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
    // jsdom 에 revokeObjectURL 이 없어, 언마운트 시 정리 effect 가 그대로 두면 처리되지 않은 예외가 난다.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  it('navigate state 로 attachedImageId 를 받으면 글쓰기 폼이 그 이미지가 첨부된 채로 열린다', async () => {
    vi.mocked(getPostImageBlobUrl).mockResolvedValue('blob:attached-preview')

    render(
      <MemoryRouter initialEntries={[{ pathname: '/community', state: { attachedImageId: 42 } }]}>
        <Community />
      </MemoryRouter>,
    )

    // 폼이 자동으로 열려 제목 입력창이 바로 보인다.
    await screen.findByPlaceholderText('제목을 입력해 주세요')
    expect(getPostImageBlobUrl).toHaveBeenCalledWith(42)
    await screen.findByAltText('첨부한 사진 미리보기')

    vi.mocked(createPost).mockResolvedValue({
      postId: 1,
      authorNickname: 'me',
      title: '제목',
      content: '내용',
      instrumentId: null,
      instrumentSymbol: null,
      instrumentName: null,
      imageId: 42,
      imageUrl: '/api/community/posts/images/42/file',
      likeCount: 0,
      likedByMe: false,
      createdAt: '2026-08-18T00:00:00',
      updatedAt: '2026-08-18T00:00:00',
    })
    fireEvent.change(screen.getByPlaceholderText('제목을 입력해 주세요'), { target: { value: '제목' } })
    fireEvent.change(screen.getByPlaceholderText('이 종목에 대한 생각을 자유롭게 남겨보세요'), {
      target: { value: '내용' },
    })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ imageId: 42 }))
    // 새로 파일을 고른 게 아니므로 업로드는 다시 호출되지 않는다 — 이미 완료된 업로드를 재사용한다.
    expect(uploadPostImage).not.toHaveBeenCalled()
  })

  it('state 가 없는 일반 진입은 폼이 닫힌 채로 시작한다', async () => {
    render(
      <MemoryRouter initialEntries={['/community']}>
        <Community />
      </MemoryRouter>,
    )

    await waitFor(() => expect(getPosts).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText('제목을 입력해 주세요')).not.toBeInTheDocument()
    expect(getPostImageBlobUrl).not.toHaveBeenCalled()
  })
})
