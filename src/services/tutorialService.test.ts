// 튜토리얼 attempt 서비스가 백엔드 계약의 메서드·경로·본문을 그대로 사용하는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/apiClient'
import {
  ensurePracticeAttempt,
  getPracticeAttemptChart,
  restartPracticeAttempt,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from './tutorialService'

vi.mock('../lib/apiClient', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('tutorial attempt service contract', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({} as never)
    vi.mocked(api.post).mockResolvedValue({} as never)
    vi.mocked(api.put).mockResolvedValue({} as never)
  })

  it('ensures and selects an instrument with PUT and only select has a payload', async () => {
    await ensurePracticeAttempt('STOCK')
    await selectPracticeInstrument('CRYPTO', 701)

    expect(api.put).toHaveBeenNthCalledWith(1, '/education/practice/attempts/STOCK')
    expect(api.put).toHaveBeenNthCalledWith(2, '/education/practice/attempts/CRYPTO/instrument', {
      instrumentId: 701,
    })
  })

  it('uses POST for explicit restart and tick while chart initialization stays a pure GET', async () => {
    await restartPracticeAttempt('STOCK')
    await getPracticeAttemptChart('CRYPTO')
    await tickPracticeAttempt('CRYPTO')

    expect(api.post).toHaveBeenNthCalledWith(1, '/education/practice/attempts/STOCK/restart')
    expect(api.get).toHaveBeenCalledWith('/education/practice/attempts/CRYPTO/chart')
    expect(api.post).toHaveBeenNthCalledWith(2, '/education/practice/attempts/CRYPTO/tick')
  })
})
