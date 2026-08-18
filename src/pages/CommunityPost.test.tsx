// 게시글 상세에서 sharedTrade 가 있으면 매매 카드를, 없으면 첨부 이미지를 그리는지(서로 배타적) 검증한다
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/AuthContext'
import { getComments, getPost } from '../services/communityService'
import type { Post } from '../services/types'
import { CommunityPost } from './CommunityPost'

vi.mock('../services/communityService', () => ({
  getPost: vi.fn(),
  getComments: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  countComments: (comments: unknown[]) => comments.length,
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

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
