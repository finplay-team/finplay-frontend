// getCandles가 배열 응답과 봉투({content,nextCursor,hasNext}) 응답을 모두 Candle[]로 풀어내는지 검증한다
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

describe('getCandles response envelope compatibility', () => {
  it('returns the array as-is when the backend still responds with a bare array', async () => {
    vi.mocked(api.get).mockResolvedValue([candle] as never)

    const result = await getCandles(1)

    expect(result).toEqual([candle])
  })

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

  it('returns an empty array when the bare-array response is empty', async () => {
    vi.mocked(api.get).mockResolvedValue([] as never)

    const result = await getCandles(1)

    expect(result).toEqual([])
  })
})
