// 수익 인증 카드(sharedTradeId) 진입 시 글쓰기 폼 프리필·이미지와의 배타성·등록 요청·목록 렌더링을 검증한다
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstruments } from '../hooks/useInstruments'
import { createPost, getPosts } from '../services/communityService'
import type { Post, PostPage } from '../services/types'
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

function post(overrides: Partial<Post> = {}): Post {
  return {
    postId: 1,
    authorNickname: 'me',
    title: '제목',
    content: '내용',
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

describe('Community 진입 시 sharedTradeId 프리필', () => {
  beforeEach(() => {
    vi.mocked(getPosts).mockResolvedValue(emptyPage())
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
  })

  it('navigate state 로 sharedTradeId 를 받으면 글쓰기 폼이 자동으로 열리고 매매 카드 안내를 보여준다', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/community', state: { sharedTradeId: 501 } }]}>
        <Community />
      </MemoryRouter>,
    )

    await screen.findByPlaceholderText('제목을 입력해 주세요')
    expect(screen.getByText('이 매매의 수익 인증 카드가 함께 등록돼요.')).toBeInTheDocument()
    // 이미지·매매 카드는 동시에 붙지 않으므로 사진 첨부 UI는 보이지 않는다.
    expect(screen.queryByText('사진 추가하기')).not.toBeInTheDocument()
  })

  it('등록 시 sharedTradeId 를 실어 보내고 imageId 는 보내지 않는다', async () => {
    vi.mocked(createPost).mockResolvedValue(post({ sharedTrade: null }))

    render(
      <MemoryRouter initialEntries={[{ pathname: '/community', state: { sharedTradeId: 501 } }]}>
        <Community />
      </MemoryRouter>,
    )

    await screen.findByPlaceholderText('제목을 입력해 주세요')
    fireEvent.change(screen.getByPlaceholderText('제목을 입력해 주세요'), { target: { value: '제목' } })
    fireEvent.change(screen.getByPlaceholderText('이 종목에 대한 생각을 자유롭게 남겨보세요'), {
      target: { value: '내용' },
    })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    const req = vi.mocked(createPost).mock.calls[0][0]
    expect(req.sharedTradeId).toBe(501)
    expect(req).not.toHaveProperty('imageId')
  })

  it('"제거"를 누르면 매매 카드 첨부를 취소하고 다시 사진을 첨부할 수 있다', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/community', state: { sharedTradeId: 501 } }]}>
        <Community />
      </MemoryRouter>,
    )

    await screen.findByText('이 매매의 수익 인증 카드가 함께 등록돼요.')
    fireEvent.click(screen.getByRole('button', { name: '제거' }))

    expect(screen.queryByText('이 매매의 수익 인증 카드가 함께 등록돼요.')).not.toBeInTheDocument()
    expect(screen.getByText('사진 추가하기')).toBeInTheDocument()
  })

  it('state 가 없는 일반 진입은 사진 첨부 UI가 보인다', async () => {
    render(
      <MemoryRouter initialEntries={['/community']}>
        <Community />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '첫 글 쓰기' }))
    expect(screen.getByText('사진 추가하기')).toBeInTheDocument()
  })
})

describe('Community 목록 — 매매 카드 렌더링', () => {
  beforeEach(() => {
    vi.mocked(useInstruments).mockReturnValue({ index: null, loading: false, error: null })
  })

  it('post.sharedTrade 가 있으면 TradeShareCard 를, 없으면 첨부 이미지를 그린다(서로 배타적)', async () => {
    vi.mocked(getPosts).mockResolvedValue({
      content: [
        post({
          postId: 1,
          title: '수익 인증',
          sharedTrade: {
            symbol: 'BTC',
            name: '비트코인',
            market: 'CRYPTO',
            buyPrice: 50_000_000,
            sellPrice: 56_900_000,
            quantity: 0.001,
            realizedPnl: 6_900,
            returnRate: 0.138,
          },
        }),
      ],
      page: 0,
      size: 10,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
    })

    render(
      <MemoryRouter>
        <Community />
      </MemoryRouter>,
    )

    await screen.findByText('수익 인증')
    expect(screen.getByText('비트코인')).toBeInTheDocument()
    expect(screen.getByText('+13.80%')).toBeInTheDocument()
  })
})
