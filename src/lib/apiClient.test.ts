// FormData 본문은 JSON 으로 바꾸지 않고, 이미지 다운로드는 blob 그대로 돌려주는지 검증한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './apiClient'

vi.mock('./tokenStore', () => ({
  getAccessToken: vi.fn(() => 'token-abc'),
  getRefreshToken: vi.fn(() => 'refresh-abc'),
  clearSession: vi.fn(),
  setSession: vi.fn(),
}))

function requestInit(callIndex = 0): RequestInit {
  const call = vi.mocked(fetch).mock.calls[callIndex]
  return call[1] as RequestInit
}

describe('apiClient body encoding', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
  })

  it('sends FormData bodies as-is without forcing a JSON Content-Type', async () => {
    const formData = new FormData()
    formData.append('image', new File(['x'], 'a.png', { type: 'image/png' }))

    await api.post('/community/posts/images', formData)

    const init = requestInit()
    expect(init.body).toBe(formData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('still JSON-encodes plain object bodies', async () => {
    await api.post('/community/posts', { title: 't', content: 'c' })

    const init = requestInit()
    expect(init.body).toBe(JSON.stringify({ title: 't', content: 'c' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('apiClient.getBlob', () => {
  it('returns the response body as a Blob with the Authorization header attached', async () => {
    const blob = new Blob(['binary'], { type: 'image/png' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(blob, { status: 200 })))

    const result = await api.getBlob('/community/posts/images/1/file')

    expect(result).toBeInstanceOf(Blob)
    const init = requestInit()
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
  })
})
