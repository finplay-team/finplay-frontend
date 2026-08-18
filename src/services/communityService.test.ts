// 이미지 업로드·다운로드 서비스가 백엔드 계약대로 멀티파트 파트명·경로·blob 변환을 쓰는지 검증한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/apiClient'
import { getPostImageBlobUrl, uploadPostImage } from './communityService'

vi.mock('../lib/apiClient', () => ({
  api: {
    post: vi.fn(),
    getBlob: vi.fn(),
  },
}))

describe('community image service contract', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockResolvedValue({
      imageId: 1,
      imageUrl: '/api/community/posts/images/1/file',
    } as never)
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['x'], { type: 'image/png' }) as never)
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  it('uploads the file under the "image" multipart field to the images endpoint', async () => {
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' })
    await uploadPostImage(file)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/community/posts/images')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('image')).toBe(file)
  })

  it('fetches the image file by id and turns the blob into an object URL', async () => {
    const url = await getPostImageBlobUrl(42)

    expect(api.getBlob).toHaveBeenCalledWith('/community/posts/images/42/file')
    expect(url).toBe('blob:mock-url')
  })
})
