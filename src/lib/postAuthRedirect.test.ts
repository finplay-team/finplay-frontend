// 로그인·가입 직후 목적지가 "attempt가 있는가"가 아니라 "실제로 시작했는가"로 갈리는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentPracticeResponse, PracticeAttemptResponse } from '../services/tutorialTypes'
import { getPracticeProgress } from '../services/tutorialService'
import { resolvePostAuthPath } from './postAuthRedirect'
import type { Market } from '../services/types'

vi.mock('../services/tutorialService', () => ({
  getPracticeProgress: vi.fn(),
}))

function attempt(
  market: Market,
  overrides: Partial<PracticeAttemptResponse> = {},
): PracticeAttemptResponse {
  return {
    attemptId: market === 'CRYPTO' ? 10 : 20,
    market,
    runNumber: 1,
    mode: 'ACTIVE',
    status: 'SELECTING_INSTRUMENT',
    instrumentId: null,
    anchorAt: null,
    tutorialDate: null,
    riskSnapshot: null,
    completedAt: null,
    ...overrides,
  }
}

function progress(
  market: Market,
  overrides: Partial<InvestmentPracticeResponse> = {},
): InvestmentPracticeResponse {
  return {
    tutorialKey: market === 'CRYPTO' ? 'COIN_PRACTICE_V1' : 'INVESTMENT_PRACTICE_V1',
    status: 'NOT_STARTED',
    currentStep: 1,
    steps: [],
    completedAt: null,
    rewardAmount: null,
    entries: [],
    priceAfterSell: null,
    revealedEvents: [],
    attempt: attempt(market),
    ...overrides,
  }
}

/** 시장별 응답을 지정한다. Error 를 주면 그 시장의 조회가 실패한 것으로 만든다. */
function mockProgress(byMarket: Record<Market, InvestmentPracticeResponse | Error>) {
  vi.mocked(getPracticeProgress).mockImplementation(async (market) => {
    const result = byMarket[market]
    if (result instanceof Error) throw result
    return result
  })
}

describe('resolvePostAuthPath', () => {
  beforeEach(() => {
    vi.mocked(getPracticeProgress).mockReset()
  })

  it('두 시장 모두 시작 전이면 /tutorial 로 보낸다', async () => {
    mockProgress({
      STOCK: progress('STOCK', { status: 'NOT_STARTED', attempt: null }),
      CRYPTO: progress('CRYPTO', { status: 'NOT_STARTED', attempt: null }),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/tutorial')
  })

  it('화면만 열어 attempt 가 생긴 IN_PROGRESS(종목 미선택)는 시작으로 치지 않는다', async () => {
    // Tutorial 페이지 마운트가 ensurePracticeAttempt 를 부르면 종목을 고르지 않아도 IN_PROGRESS 다.
    mockProgress({
      STOCK: progress('STOCK', {
        status: 'IN_PROGRESS',
        attempt: attempt('STOCK', { status: 'SELECTING_INSTRUMENT', instrumentId: null }),
      }),
      CRYPTO: progress('CRYPTO', { status: 'NOT_STARTED', attempt: null }),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/tutorial')
  })

  it('한 시장에서 종목을 골랐으면 fallback 으로 보낸다', async () => {
    mockProgress({
      STOCK: progress('STOCK', { status: 'NOT_STARTED', attempt: null }),
      CRYPTO: progress('CRYPTO', {
        status: 'IN_PROGRESS',
        attempt: attempt('CRYPTO', { status: 'IN_PROGRESS', instrumentId: 701 }),
      }),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/trade')
  })

  it('한 시장을 완료했으면 attempt 가 없어도 fallback 으로 보낸다', async () => {
    mockProgress({
      STOCK: progress('STOCK', {
        status: 'COMPLETED',
        currentStep: null,
        completedAt: '2026-08-18T10:00:00',
        rewardAmount: 5_000_000,
        attempt: null,
      }),
      CRYPTO: progress('CRYPTO', { status: 'NOT_STARTED', attempt: null }),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/trade')
  })

  it('두 시장 조회가 모두 실패하면 /tutorial 로 보낸다', async () => {
    mockProgress({
      STOCK: new Error('boom'),
      CRYPTO: new Error('boom'),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/tutorial')
  })

  it('조회에 실패한 시장은 시작 안 함으로 보되 다른 시장의 진행은 그대로 인정한다', async () => {
    mockProgress({
      STOCK: new Error('boom'),
      CRYPTO: progress('CRYPTO', {
        status: 'IN_PROGRESS',
        attempt: attempt('CRYPTO', { status: 'IN_PROGRESS', instrumentId: 701 }),
      }),
    })

    await expect(resolvePostAuthPath('/trade')).resolves.toBe('/trade')
  })
})
