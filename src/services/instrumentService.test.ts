// getCandles가 페이지네이션 봉투({content,nextCursor,hasNext}) 응답에서 content를 풀어내는지 검증한다
import { describe, expect, it, vi } from 'vitest'
import { api } from '../lib/apiClient'
import { getCandles } from './instrumentService'
import type { Candle } from './types'

vi.mock('../lib/apiClient', () => ({
  api: {
    get: vi.fn(),
  },
}))

const candle: Candle = {
  sourceTime: '2026-08-19T09:00:00',
  open: 71000,
  high: 71500,
  low: 70900,
  close: 71200,
  volume: 12345,
}

describe('getCandles', () => {
  it('unwraps content when the backend responds with the paginated envelope', async () => {
    vi.mocked(api.get).mockResolvedValue({
      content: [candle],
      nextCursor: '2026-08-19T09:00:00',
      hasNext: true,
    } as never)

    const result = await getCandles(1)

    expect(result).toEqual([candle])
  })

  it('returns an empty array when the envelope has no more candles', async () => {
    vi.mocked(api.get).mockResolvedValue({
      content: [],
      nextCursor: null,
      hasNext: false,
    } as never)

    const result = await getCandles(1)

    expect(result).toEqual([])
  })
})
