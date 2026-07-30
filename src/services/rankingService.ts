// 실현손익 기준 랭킹 스냅샷을 조회하는 서비스 (일 단위 배치 결과를 mock 반환)
import { cryptoRankings, stockRankings } from './mockDb'
import type { Market, RankingRow } from './types'

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms))

export const rankingService = {
  async getRankings(market: Market): Promise<RankingRow[]> {
    await delay()
    return market === 'STOCK' ? stockRankings : cryptoRankings
  },

  /** 특정 닉네임의 내 순위 행을 찾는다 (로그인 사용자 하이라이트용) */
  async getMyRow(market: Market, nickname: string): Promise<RankingRow | null> {
    const rows = await this.getRankings(market)
    return rows.find((r) => r.nickname === nickname) ?? null
  },
}
