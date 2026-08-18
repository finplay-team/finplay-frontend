// 수익 인증 카드 모달의 "커뮤니티에 바로 올리기"(업로드→이동) / "이미지로 저장·공유" 흐름을 검증한다.
// 캔버스 렌더링 자체는 jsdom이 실제로 그리지 않으므로 getContext·toBlob 을 최소한으로 흉내만 낸다.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import { uploadPostImage } from '../../services/communityService'
import { getPostSellFeedback } from '../../services/feedbackService'
import type { PostSellFeedbackResponse } from '../../services/feedbackTypes'
import { ProfitShareCardModal } from './ProfitShareCardModal'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))
vi.mock('../../services/feedbackService', () => ({
  getPostSellFeedback: vi.fn(),
  formatRatePercent: (ratio: number) => `${(ratio * 100).toFixed(2)}%`,
}))
vi.mock('../../services/communityService', () => ({
  uploadPostImage: vi.fn(),
}))

function feedback(overrides: Partial<PostSellFeedbackResponse> = {}): PostSellFeedbackResponse {
  return {
    tradeId: 1,
    instrumentId: 10,
    symbol: '005930',
    name: '삼성전자',
    buyAt: '2026-08-18T09:05:00',
    sellAt: '2026-08-18T10:10:00',
    buyPrice: 70000,
    sellPrice: 75000,
    quantity: 10,
    fee: 100,
    realizedPnl: 49900,
    returnRate: 0.07,
    holdingMinutes: 65,
    sameSessionCompleted: true,
    holdHighPrice: null,
    holdHighAt: null,
    holdLowPrice: null,
    holdLowAt: null,
    sellVsHighRate: null,
    sellVsLowRate: null,
    buyToNewsMinutes: null,
    priceMoves: [],
    postSellFlow: null,
    counterfactuals: null,
    peerComparison: null,
    narrative: '요약',
    narrativeSource: 'TEMPLATE',
    narrativeStatus: 'READY',
    ...overrides,
  }
}

/** jsdom 은 canvas 를 실제로 그리지 않는다 — getContext·toBlob 을 최소한으로 흉내낸다. */
function stubCanvas() {
  const fakeCtx = {
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: 'left' as CanvasTextAlign,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(['fake-png-bytes'], { type: 'image/png' }))
  })
}

describe('ProfitShareCardModal', () => {
  beforeEach(() => {
    stubCanvas()
    mockNavigate.mockClear()
  })

  afterEach(() => {
    // Web Share API 스텁이 다음 테스트로 새지 않게 정리한다(jsdom 기본값은 둘 다 없음).
    delete (navigator as { canShare?: unknown }).canShare
    delete (navigator as { share?: unknown }).share
  })

  it('로딩이 끝나면 카드 미리보기와 두 공유 액션이 보인다', async () => {
    vi.mocked(getPostSellFeedback).mockResolvedValue(feedback())
    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)

    await screen.findByRole('img', { name: '삼성전자 수익 인증 카드 미리보기' })
    expect(screen.getByRole('button', { name: '커뮤니티에 바로 올리기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이미지로 저장/공유' })).toBeInTheDocument()
  })

  it('조회 대상이 아니면(VALIDATION_ERROR) 안내 문구를 보여주고 카드를 그리지 않는다', async () => {
    vi.mocked(getPostSellFeedback).mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR'))
    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)

    expect(
      await screen.findByText('이 체결은 수익 인증 카드를 만들 수 없습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('"커뮤니티에 바로 올리기"를 누르면 캔버스를 업로드하고 imageId 를 들고 /community 로 이동한다', async () => {
    vi.mocked(getPostSellFeedback).mockResolvedValue(feedback())
    vi.mocked(uploadPostImage).mockResolvedValue({
      imageId: 42,
      imageUrl: '/api/community/posts/images/42/file',
    })
    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: '삼성전자 수익 인증 카드 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '커뮤니티에 바로 올리기' }))

    await waitFor(() => expect(uploadPostImage).toHaveBeenCalledTimes(1))
    const uploadedFile = vi.mocked(uploadPostImage).mock.calls[0][0]
    expect(uploadedFile).toBeInstanceOf(File)
    expect(uploadedFile.type).toBe('image/png')

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/community', {
        state: { attachedImageId: 42 },
      }),
    )
  })

  it('업로드가 실패하면 이동하지 않고 오류 문구를 보여준다', async () => {
    vi.mocked(getPostSellFeedback).mockResolvedValue(feedback())
    vi.mocked(uploadPostImage).mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR'))

    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: '삼성전자 수익 인증 카드 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '커뮤니티에 바로 올리기' }))

    expect(
      await screen.findByText('카드 이미지를 올리지 못했어요. 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('navigator.share 를 쓸 수 있으면 다운로드 링크 대신 공유 시트를 연다', async () => {
    vi.mocked(getPostSellFeedback).mockResolvedValue(feedback())
    const shareSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: shareSpy,
    })

    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: '삼성전자 수익 인증 카드 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '이미지로 저장/공유' }))

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1))
    const shareArg = shareSpy.mock.calls[0][0] as { files: File[]; title: string }
    expect(shareArg.files[0]).toBeInstanceOf(File)
    expect(shareArg.title).toBe('수익 인증 카드')
  })

  it('navigator.share 를 쓸 수 없으면 다운로드 링크를 대신 클릭한다', async () => {
    vi.mocked(getPostSellFeedback).mockResolvedValue(feedback())
    URL.createObjectURL = vi.fn(() => 'blob:card-download')
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ProfitShareCardModal tradeId={1} onClose={vi.fn()} />)
    await screen.findByRole('img', { name: '삼성전자 수익 인증 카드 미리보기' })

    fireEvent.click(screen.getByRole('button', { name: '이미지로 저장/공유' }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card-download')
  })
})
