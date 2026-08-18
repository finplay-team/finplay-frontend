// 글쓰기 폼의 사진 첨부(선택→업로드→게시물 연결, 형식/용량 검증), 정렬 토글, 목록 카드의 좋아요
// 낙관적 업데이트(성공·실패 롤백) 로직을 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstruments } from '../hooks/useInstruments'
import { ApiError } from '../lib/apiClient'
import { createPost, getPosts, likePost, unlikePost, uploadPostImage } from '../services/communityService'
import type { Post, PostPage } from '../services/types'
import { Community } from './Community'

vi.mock('../services/communityService', () => ({
  getPosts: vi.fn(),
  createPost: vi.fn(),
  uploadPostImage: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}))
vi.mock('../hooks/useInstruments', () => ({
  useInstruments: vi.fn(),
}))

function emptyPage(): PostPage {
  return { content: [], page: 0, size: 10, totalElements: 0, totalPages: 1, hasNext: false }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    postId: 1,
    authorNickname: '투자왕',
    title: '오늘 삼성전자 매수 후기',
    content: '아침에 매수했는데 결과가 좋았습니다.',
    instrumentId: null,
    instrumentSymbol: null,
    instrumentName: null,
    imageId: null,
    imageUrl: null,
    sharedTrade: null,
    likeCount: 3,
    likedByMe: false,
    createdAt: '2026-08-18T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    ...overrides,
  }
}

function pageWith(...posts: Post[]): PostPage {
  return { content: posts, page: 0, size: 10, totalElements: posts.length, totalPages: 1, hasNext: false }
}

function pngFile(name = 'photo.png', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
}

async function openForm() {
  render(
    <MemoryRouter>
      <Community />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: '첫 글 쓰기' }))
  await screen.findByPlaceholderText('제목을 입력해 주세요')
}

describe('Community 글쓰기 폼 — 사진 첨부', () => {
  beforeEach(() => {
    vi.mocked(getPosts).mockResolvedValue(emptyPage())
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
    URL.createObjectURL = vi.fn(() => 'blob:local-preview')
    URL.revokeObjectURL = vi.fn()
  })

  it('업로드 성공 시 미리보기를 보여주고 등록 시 imageId 를 함께 보낸다', async () => {
    vi.mocked(uploadPostImage).mockResolvedValue({ imageId: 7, imageUrl: '/api/community/posts/images/7/file' })
    vi.mocked(createPost).mockResolvedValue({
      postId: 1,
      authorNickname: 'me',
      title: '제목',
      content: '내용',
      instrumentId: null,
      instrumentSymbol: null,
      instrumentName: null,
      imageId: 7,
      imageUrl: '/api/community/posts/images/7/file',
      sharedTrade: null,
      likeCount: 0,
      likedByMe: false,
      createdAt: '2026-08-18T00:00:00',
      updatedAt: '2026-08-18T00:00:00',
    })
    await openForm()

    fireEvent.change(screen.getByPlaceholderText('제목을 입력해 주세요'), { target: { value: '제목' } })
    fireEvent.change(screen.getByPlaceholderText('이 종목에 대한 생각을 자유롭게 남겨보세요'), {
      target: { value: '내용' },
    })

    const fileInput = screen.getByLabelText('사진 추가하기')
    fireEvent.change(fileInput, { target: { files: [pngFile()] } })

    await waitFor(() => expect(uploadPostImage).toHaveBeenCalledTimes(1))
    await screen.findByAltText('첨부한 사진 미리보기')
    // 업로드가 끝나면 "업로드 중…" 표시가 사라진다.
    await waitFor(() => expect(screen.queryByText('업로드 중…')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({ title: '제목', content: '내용', imageId: 7 }),
    )
  })

  it('허용하지 않는 형식이면 업로드를 시도하지 않고 이해하기 쉬운 오류를 보여준다', async () => {
    await openForm()

    const fileInput = screen.getByLabelText('사진 추가하기')
    const textFile = new File(['hello'], 'note.txt', { type: 'text/plain' })
    fireEvent.change(fileInput, { target: { files: [textFile] } })

    expect(await screen.findByText('사진 파일만 첨부할 수 있어요 (JPEG, PNG, WEBP).')).toBeInTheDocument()
    expect(uploadPostImage).not.toHaveBeenCalled()
  })

  it('5MB 를 넘으면 업로드를 시도하지 않고 용량 초과 문구를 보여준다', async () => {
    await openForm()

    const fileInput = screen.getByLabelText('사진 추가하기')
    const bigFile = pngFile('big.png', 5 * 1024 * 1024 + 1)
    fireEvent.change(fileInput, { target: { files: [bigFile] } })

    expect(
      await screen.findByText('사진 용량이 너무 커요. 5MB 이하로 줄여서 다시 올려 주세요.'),
    ).toBeInTheDocument()
    expect(uploadPostImage).not.toHaveBeenCalled()
  })

  it('업로드 실패 시 미리보기를 지우고 서버 오류를 사용자 문구로 보여준다', async () => {
    vi.mocked(uploadPostImage).mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR'))
    await openForm()

    fireEvent.change(screen.getByLabelText('사진 추가하기'), { target: { files: [pngFile()] } })

    expect(
      await screen.findByText('허용하지 않는 사진 형식이거나 5MB를 넘었어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('첨부한 사진 미리보기')).not.toBeInTheDocument()
  })

  it('사진 삭제 버튼을 누르면 imageId 없이 다시 첨부할 수 있는 상태로 돌아간다', async () => {
    vi.mocked(uploadPostImage).mockResolvedValue({ imageId: 9, imageUrl: '/api/community/posts/images/9/file' })
    await openForm()

    fireEvent.change(screen.getByLabelText('사진 추가하기'), { target: { files: [pngFile()] } })
    await screen.findByAltText('첨부한 사진 미리보기')

    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }))

    expect(screen.queryByAltText('첨부한 사진 미리보기')).not.toBeInTheDocument()
    expect(screen.getByLabelText('사진 추가하기')).toBeInTheDocument()
  })
})

describe('Community 정렬 토글', () => {
  beforeEach(() => {
    vi.mocked(getPosts).mockResolvedValue(emptyPage())
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
  })

  it('처음 진입하면 최신순(sort=latest)으로 목록을 부른다', async () => {
    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )

    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(1))
    expect(getPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ instrumentId: null, sort: 'latest' }),
    )
  })

  it('인기순을 누르면 sort=popular 로 다시 불러온다', async () => {
    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )
    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '인기순' }))

    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(2))
    expect(getPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', page: 0 }),
    )
  })

  it('종목 필터가 걸려 있으면 정렬을 바꿔도 instrumentId 를 함께 유지한다', async () => {
    render(
      <MemoryRouter initialEntries={['/community?instrumentId=5']}>
        <Community />
      </MemoryRouter>,
    )
    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '인기순' }))

    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(2))
    expect(getPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', instrumentId: 5 }),
    )
  })
})

describe('Community 목록 카드 — 좋아요', () => {
  beforeEach(() => {
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
  })

  it('클릭하면 즉시 카운트·상태를 바꾸고, 성공하면 서버 응답 값으로 맞춘다', async () => {
    vi.mocked(getPosts).mockResolvedValue(pageWith(makePost({ likeCount: 3, likedByMe: false })))
    vi.mocked(likePost).mockResolvedValue({ postId: 1, likeCount: 4, likedByMe: true })

    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: '좋아요' })
    expect(button).toHaveTextContent('좋아요 3')

    fireEvent.click(button)

    // 낙관적 업데이트가 응답을 기다리지 않고 먼저 반영된다.
    expect(screen.getByRole('button', { name: '좋아요 취소' })).toHaveTextContent('좋아요 4')

    await waitFor(() => expect(likePost).toHaveBeenCalledWith(1))
    expect(screen.getByRole('button', { name: '좋아요 취소' })).toHaveTextContent('좋아요 4')
  })

  it('실패하면 원래 값으로 되돌리고 오류 문구를 보여준다', async () => {
    vi.mocked(getPosts).mockResolvedValue(pageWith(makePost({ likeCount: 3, likedByMe: false })))
    vi.mocked(likePost).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'))

    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: '좋아요' })
    fireEvent.click(button)

    await waitFor(() =>
      expect(
        screen.getByText('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: '좋아요' })).toHaveTextContent('좋아요 3')
  })

  it('취소 클릭은 DELETE 를 부르고 카운트를 하나 줄인다', async () => {
    vi.mocked(getPosts).mockResolvedValue(pageWith(makePost({ likeCount: 5, likedByMe: true })))
    vi.mocked(unlikePost).mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: '좋아요 취소' })
    expect(button).toHaveTextContent('좋아요 5')

    fireEvent.click(button)

    expect(screen.getByRole('button', { name: '좋아요' })).toHaveTextContent('좋아요 4')
    await waitFor(() => expect(unlikePost).toHaveBeenCalledWith(1))
  })
})
