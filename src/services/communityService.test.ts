// 이미지 업로드·다운로드, 목록 정렬 파라미터, 좋아요 표시·취소가 백엔드 계약대로 경로·쿼리·본문을 쓰는지 검증한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/apiClient'
import { getPostImageBlobUrl, getPosts, likePost, unlikePost, uploadPostImage } from './communityService'

vi.mock('../lib/apiClient', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
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

describe('community post list sort', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      content: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 1,
      hasNext: false,
    } as never)
  })

  it('omits the sort query key when not given (server default is latest)', async () => {
    await getPosts({ page: 0, size: 10 })

    const [path, options] = vi.mocked(api.get).mock.calls[0]
    expect(path).toBe('/community/posts')
    expect((options as { query?: Record<string, unknown> }).query).toMatchObject({ sort: undefined })
  })

  it('forwards sort=popular as a query param', async () => {
    await getPosts({ page: 0, size: 10, sort: 'popular' })

    const [, options] = vi.mocked(api.get).mock.calls[0]
    expect((options as { query?: Record<string, unknown> }).query).toMatchObject({ sort: 'popular' })
  })
})

describe('community post likes', () => {
  it('likes a post via POST to the likes sub-resource', async () => {
    vi.mocked(api.post).mockResolvedValue({ postId: 5, likeCount: 3, likedByMe: true } as never)

    const res = await likePost(5)

    expect(api.post).toHaveBeenCalledWith('/community/posts/5/likes')
    expect(res).toEqual({ postId: 5, likeCount: 3, likedByMe: true })
  })

  it('unlikes a post via DELETE to the likes sub-resource', async () => {
    vi.mocked(api.del).mockResolvedValue(undefined as never)

    await unlikePost(5)

    expect(api.del).toHaveBeenCalledWith('/community/posts/5/likes')
  })
})
