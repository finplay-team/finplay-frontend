// 첨부 이미지 blob 로딩 성공/실패에 따라 이미지 또는 빈 상태를 그리는지 검증한다
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPostImageBlobUrl } from '../../services/communityService'
import { AttachedImage } from './AttachedImage'

vi.mock('../../services/communityService', () => ({
  getPostImageBlobUrl: vi.fn(),
}))

describe('AttachedImage', () => {
  beforeEach(() => {
    URL.revokeObjectURL = vi.fn()
  })

  it('renders the resolved blob URL once loaded', async () => {
    vi.mocked(getPostImageBlobUrl).mockResolvedValue('blob:mock-1')
    render(<AttachedImage imageId={1} alt="사진" />)

    const img = await screen.findByRole('img', { name: '사진' })
    expect(img).toHaveAttribute('src', 'blob:mock-1')
  })

  it('renders nothing when the image fails to load(deleted image etc.)', async () => {
    vi.mocked(getPostImageBlobUrl).mockRejectedValue(new Error('boom'))
    render(<AttachedImage imageId={2} alt="사진" />)

    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument())
  })
})
