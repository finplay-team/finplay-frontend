// 입문자 튜토리얼 진행 판정과 단계별 시드 % 보너스 지급을 처리하는 서비스
import {
  accounts,
  claimedTutorial,
  decisionLogs,
  holdings,
  pendingOrders,
  tradeRecords,
  tutorialSteps,
} from './mockDb'
import type { ClaimResult, TutorialProgress } from './types'

const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

function userAccountIds(userId: string): string[] {
  return accounts.filter((a) => a.userId === userId).map((a) => a.id)
}

function claimedSet(userId: string): Set<string> {
  if (!claimedTutorial[userId]) claimedTutorial[userId] = new Set()
  return claimedTutorial[userId]
}

/** 단계별 완료 여부를 실제 거래 활동으로 자동 판정 */
function isCompleted(stepId: string, userId: string): boolean {
  const accIds = userAccountIds(userId)
  const stockAcc = accounts.find((a) => a.userId === userId && a.market === 'STOCK')
  const cryptoAcc = accounts.find((a) => a.userId === userId && a.market === 'CRYPTO')
  const myTrades = tradeRecords.filter((t) => accIds.includes(t.accountId))
  const myHoldings = holdings.filter((h) => accIds.includes(h.accountId))
  const myTradeIds = new Set(myTrades.map((t) => t.id))
  const myPendingIds = new Set(
    pendingOrders.filter((o) => accIds.includes(o.accountId)).map((o) => o.id),
  )
  const myLogs = decisionLogs.filter(
    (d) => myTradeIds.has(d.tradeId) || myPendingIds.has(d.tradeId),
  )

  switch (stepId) {
    case 'tut_01':
      return myTrades.some((t) => t.side === 'BUY')
    case 'tut_02':
      return myLogs.length > 0
    case 'tut_03': {
      const distinct = new Set(myHoldings.map((h) => h.instrumentId))
      return distinct.size >= 3
    }
    case 'tut_04':
      return myTrades.some((t) => t.side === 'SELL')
    case 'tut_05':
      return (
        !!stockAcc &&
        !!cryptoAcc &&
        myTrades.some((t) => t.accountId === stockAcc.id) &&
        myTrades.some((t) => t.accountId === cryptoAcc.id)
      )
    default:
      return false
  }
}

export const tutorialService = {
  async getProgress(userId: string): Promise<TutorialProgress[]> {
    await delay()
    const claimed = claimedSet(userId)
    return [...tutorialSteps]
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        step,
        completed: isCompleted(step.id, userId),
        claimed: claimed.has(step.id),
      }))
  },

  /** 완료된 단계의 보상을 각 계좌에 시드 % 만큼 지급 */
  async claim(userId: string, stepId: string): Promise<ClaimResult> {
    await delay(250)
    const step = tutorialSteps.find((s) => s.id === stepId)
    if (!step) throw new Error('튜토리얼 단계를 찾을 수 없습니다.')
    if (!isCompleted(stepId, userId)) throw new Error('아직 완료하지 않은 단계입니다.')

    const claimed = claimedSet(userId)
    if (claimed.has(stepId)) throw new Error('이미 보상을 받은 단계입니다.')

    const myAccounts = accounts.filter((a) => a.userId === userId)
    let bonusPerAccount = 0
    for (const acc of myAccounts) {
      const bonus = Math.round(acc.seedAmount * step.rewardRate)
      acc.cashBalance += bonus
      acc.bonusTotal += bonus
      bonusPerAccount = bonus
    }
    claimed.add(stepId)

    return {
      rewardRate: step.rewardRate,
      bonusPerAccount,
      progress: await this.getProgress(userId),
    }
  },
}
