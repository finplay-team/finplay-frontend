// 게시글 상세에서 sharedTrade 가 있으면 매매 카드를, 없으면 첨부 이미지를 그리는지(서로 배타적) 검증하고,
// 좋아요 낙관적 업데이트(성공·실패 롤백)를 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../lib/apiClient'
import { getComments, getPost, likePost, unlikePost } from '../services/communityService'
import type { Post } from '../services/types'
import { CommunityPost } from './CommunityPost'

vi.mock('../services/communityService', () => ({
  getPost: vi.fn(),
  getComments: vi.fn(),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  deletePost: vi.fn(),
  updatePost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
  countComments: (comments: unknown[]) => comments.length,
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../lib/postShare', () => ({
  sharePostLink: vi.fn(),
  sharePostImage: vi.fn(),
}))

function post(overrides: Partial<Post> = {}): Post {
  return {
    postId: 1,
    authorNickname: 'other',
    title: '수익 인증',
    content: '오늘 익절했습니다',
    instrumentId: null,
    instrumentSymbol: null,
    instrumentName: null,
    imageId: null,
    imageUrl: null,
    sharedTrade: null,
    likeCount: 0,
    likedByMe: false,
    createdAt: '2026-08-18T00:00:00',
    updatedAt: '2026-08-18T00:00:00',
    ...overrides,
  }
}

function renderPost() {
  return render(
    <MemoryRouter initialEntries={['/community/1']}>
      <Routes>
        <Route path="/community/:postId" element={<CommunityPost />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CommunityPost 상세 — 매매 카드 렌더링', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ member: null } as never)
    vi.mocked(getComments).mockResolvedValue([])
  })

  it('post.sharedTrade 가 있으면 TradeShareCard 를 그린다', async () => {
    vi.mocked(getPost).mockResolvedValue(
      post({
        sharedTrade: {
          symbol: '005930',
          name: '삼성전자',
          market: 'STOCK',
          buyPrice: 70_000,
          sellPrice: 75_000,
          quantity: 10,
          realizedPnl: 49_900,
          returnRate: 0.07,
        },
      }),
    )

    renderPost()

    await screen.findByText('삼성전자')
    expect(screen.getByText('+7.00%')).toBeInTheDocument()
    expect(screen.getByText('주식')).toBeInTheDocument()
  })

  it('sharedTrade 가 없으면 매매 카드를 그리지 않는다', async () => {
    vi.mocked(getPost).mockResolvedValue(post())

    renderPost()

    await screen.findByText('오늘 익절했습니다')
    expect(screen.queryByText('매도')).not.toBeInTheDocument()
  })
})

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

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/community/1']}>
      <Routes>
        <Route path="/community/:postId" element={<CommunityPost />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(getPost).toHaveBeenCalledTimes(1))
}

describe('CommunityPost 상세 — 좋아요', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      member: null,
      status: 'anonymous',
      refresh: vi.fn(),
      logout: vi.fn(),
    } as never)
    vi.mocked(getComments).mockResolvedValue([])
  })

  it('클릭하면 즉시 카운트·상태를 바꾸고, 성공하면 서버 응답 값으로 맞춘다', async () => {
    vi.mocked(getPost).mockResolvedValue(makePost({ likeCount: 3, likedByMe: false }))
    vi.mocked(likePost).mockResolvedValue({ postId: 1, likeCount: 4, likedByMe: true })
    await renderDetail()

    const button = await screen.findByRole('button', { name: '좋아요' })
    expect(button).toHaveTextContent('좋아요 3')

    fireEvent.click(button)

    expect(screen.getByRole('button', { name: '좋아요 취소' })).toHaveTextContent('좋아요 4')
    await waitFor(() => expect(likePost).toHaveBeenCalledWith(1))
    expect(screen.getByRole('button', { name: '좋아요 취소' })).toHaveTextContent('좋아요 4')
  })

  it('실패하면 원래 값으로 되돌리고 오류 문구를 보여준다', async () => {
    vi.mocked(getPost).mockResolvedValue(makePost({ likeCount: 3, likedByMe: false }))
    vi.mocked(likePost).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'))
    await renderDetail()

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
    vi.mocked(getPost).mockResolvedValue(makePost({ likeCount: 5, likedByMe: true }))
    vi.mocked(unlikePost).mockResolvedValue(undefined)
    await renderDetail()

    const button = await screen.findByRole('button', { name: '좋아요 취소' })
    expect(button).toHaveTextContent('좋아요 5')

    fireEvent.click(button)

    expect(screen.getByRole('button', { name: '좋아요' })).toHaveTextContent('좋아요 4')
    await waitFor(() => expect(unlikePost).toHaveBeenCalledWith(1))
  })
})
