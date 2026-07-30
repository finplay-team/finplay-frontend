// 모의투자 매수/매도 체결, 시세 시뮬레이션, 보유·거래·투자일기 조회를 처리하는 거래 서비스
import {
  accounts,
  decisionLogs,
  holdings,
  instruments,
  livePrices,
  openPrices,
  pendingOrders,
  tradeRecords,
} from './mockDb'
import type {
  DecisionLog,
  Instrument,
  Market,
  PendingOrder,
  PlaceOrderInput,
  PlaceOrderResult,
  PortfolioSummary,
  Position,
  Quote,
  TradeRecord,
} from './types'

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))

/** 시장·방향별 수수료율 (교육용 간이값) */
const FEE_RATE: Record<Market, { BUY: number; SELL: number }> = {
  STOCK: { BUY: 0.00015, SELL: 0.00015 + 0.0018 }, // 매도 시 거래세 포함
  CRYPTO: { BUY: 0.0005, SELL: 0.0005 },
}

let tradeSeq = tradeRecords.length
let pendingSeq = 0
let logSeq = decisionLogs.length

function instrumentById(id: string): Instrument {
  const inst = instruments.find((i) => i.id === id)
  if (!inst) throw new Error('종목을 찾을 수 없습니다.')
  return inst
}

function accountById(id: string) {
  const acc = accounts.find((a) => a.id === id)
  if (!acc) throw new Error('계좌를 찾을 수 없습니다.')
  return acc
}

/** 호가 단위로 반올림 */
function roundTick(price: number, tick: number): number {
  if (tick <= 0) return Math.round(price)
  return Math.round(price / tick) * tick
}

function computeFee(market: Market, side: 'BUY' | 'SELL', amount: number): number {
  return Math.round(amount * FEE_RATE[market][side])
}

/** 보유분 갱신 (매수는 평단 재계산, 매도는 수량 차감) */
function applyHolding(
  accountId: string,
  instrumentId: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
) {
  const existing = holdings.find(
    (h) => h.accountId === accountId && h.instrumentId === instrumentId,
  )
  if (side === 'BUY') {
    if (existing) {
      const totalCost = existing.avgPrice * existing.quantity + price * quantity
      existing.quantity += quantity
      existing.avgPrice = totalCost / existing.quantity
    } else {
      holdings.push({ accountId, instrumentId, quantity, avgPrice: price })
    }
  } else if (existing) {
    existing.quantity -= quantity
    if (existing.quantity <= 1e-8) {
      holdings.splice(holdings.indexOf(existing), 1)
    }
  }
}

/** 실제 체결 처리 (검증 통과 후 호출) */
function fill(
  accountId: string,
  inst: Instrument,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
): TradeRecord {
  const account = accountById(accountId)
  const amount = price * quantity
  const fee = computeFee(inst.market, side, amount)

  if (side === 'BUY') {
    account.cashBalance -= amount + fee
    applyHolding(accountId, inst.id, 'BUY', quantity, price)
  } else {
    const holding = holdings.find(
      (h) => h.accountId === accountId && h.instrumentId === inst.id,
    )
    const realized = (price - (holding?.avgPrice ?? price)) * quantity - fee
    account.cashBalance += amount - fee
    account.realizedPnl += realized
    applyHolding(accountId, inst.id, 'SELL', quantity, price)
  }

  const trade: TradeRecord = {
    id: `t_${++tradeSeq}`,
    accountId,
    instrumentId: inst.id,
    instrumentName: inst.name,
    side,
    price,
    quantity,
    amount,
    fee,
    executedAt: new Date().toISOString(),
  }
  tradeRecords.unshift(trade)
  return trade
}

export const tradeService = {
  async getInstruments(market: Market): Promise<Instrument[]> {
    await delay(150)
    return instruments.filter((i) => i.market === market && i.isTradable)
  },

  /** 시장 내 거래가능 종목의 현재 시세 스냅샷 */
  getQuotesSync(market: Market): Quote[] {
    return instruments
      .filter((i) => i.market === market && i.isTradable)
      .map((i) => {
        const price = livePrices[i.id] ?? openPrices[i.id] ?? 0
        const open = openPrices[i.id] ?? price
        const changeAmount = price - open
        return {
          instrumentId: i.id,
          price,
          changeAmount,
          changeRate: open ? (changeAmount / open) * 100 : 0,
        }
      })
  },

  getQuoteSync(instrumentId: string): Quote {
    const price = livePrices[instrumentId] ?? openPrices[instrumentId] ?? 0
    const open = openPrices[instrumentId] ?? price
    const changeAmount = price - open
    return {
      instrumentId,
      price,
      changeAmount,
      changeRate: open ? (changeAmount / open) * 100 : 0,
    }
  },

  /** 시세 한 틱 진행 (랜덤워크) + 체결 가능한 지정가 주문 처리 */
  tick(market?: Market) {
    for (const inst of instruments) {
      if (market && inst.market !== market) continue
      if (!inst.isTradable) continue
      const cur = livePrices[inst.id] ?? openPrices[inst.id]
      if (cur == null) continue
      const drift = cur * (Math.random() - 0.5) * 0.006 // ±0.3%
      const next = roundTick(Math.max(inst.tickSize || 1, cur + drift), inst.tickSize)
      livePrices[inst.id] = next
    }
    this.matchPending()
  },

  /** 현재가가 지정가를 교차한 미체결 주문을 체결 */
  matchPending() {
    for (const order of [...pendingOrders]) {
      const price = livePrices[order.instrumentId]
      if (price == null) continue
      const crossable =
        order.side === 'BUY' ? price <= order.limitPrice : price >= order.limitPrice
      if (!crossable) continue

      const inst = instrumentById(order.instrumentId)
      const account = accountById(order.accountId)
      // 매수 대기 주문은 잔고 재확인
      if (order.side === 'BUY' && account.cashBalance < order.limitPrice * order.quantity) {
        continue
      }
      const trade = fill(order.accountId, inst, order.side, order.quantity, order.limitPrice)
      // 대기 시점에 남긴 투자일기를 실제 체결 거래에 연결
      const log = decisionLogs.find((d) => d.tradeId === order.id)
      if (log) log.tradeId = trade.id
      pendingOrders.splice(pendingOrders.indexOf(order), 1)
    }
  },

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    await delay(300)
    const inst = instrumentById(input.instrumentId)
    const account = accountById(input.accountId)

    if (!inst.isTradable) throw new Error('현재 거래할 수 없는 종목입니다.')
    if (input.quantity <= 0) throw new Error('수량을 확인해 주세요.')

    const marketPrice = livePrices[inst.id] ?? openPrices[inst.id] ?? 0
    const isLimit = input.orderType === 'LIMIT'
    if (isLimit && (!input.limitPrice || input.limitPrice <= 0)) {
      throw new Error('지정가를 입력해 주세요.')
    }
    const orderPrice = isLimit ? input.limitPrice! : marketPrice
    const amount = orderPrice * input.quantity

    if (inst.minOrderAmount && amount < inst.minOrderAmount) {
      throw new Error(`최소 주문 금액은 ${inst.minOrderAmount.toLocaleString('ko-KR')}원입니다.`)
    }

    if (input.side === 'BUY') {
      const fee = computeFee(inst.market, 'BUY', amount)
      if (account.cashBalance < amount + fee) {
        throw new Error('현금 잔고가 부족합니다.')
      }
    } else {
      const holding = holdings.find(
        (h) => h.accountId === account.id && h.instrumentId === inst.id,
      )
      if (!holding || holding.quantity < input.quantity) {
        throw new Error('보유 수량이 부족합니다.')
      }
    }

    // 지정가인데 즉시 체결 불가하면 미체결 대기
    const crossableNow =
      !isLimit ||
      (input.side === 'BUY' ? marketPrice <= input.limitPrice! : marketPrice >= input.limitPrice!)

    if (isLimit && !crossableNow) {
      const pending: PendingOrder = {
        id: `p_${++pendingSeq}`,
        accountId: account.id,
        instrumentId: inst.id,
        instrumentName: inst.name,
        side: input.side,
        limitPrice: input.limitPrice!,
        quantity: input.quantity,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }
      pendingOrders.unshift(pending)
      if (input.decision) {
        decisionLogs.unshift({
          id: `d_${++logSeq}`,
          tradeId: pending.id,
          instrumentName: inst.name,
          side: input.side,
          basis: input.decision.basis,
          memo: input.decision.memo,
          createdAt: new Date().toISOString(),
        })
      }
      return { status: 'PENDING', pending }
    }

    const trade = fill(account.id, inst, input.side, input.quantity, orderPrice)
    if (input.decision) {
      decisionLogs.unshift({
        id: `d_${++logSeq}`,
        tradeId: trade.id,
        instrumentName: inst.name,
        side: input.side,
        basis: input.decision.basis,
        memo: input.decision.memo,
        createdAt: new Date().toISOString(),
      })
    }
    return { status: 'FILLED', trade }
  },

  async cancelPending(orderId: string): Promise<void> {
    await delay(150)
    const idx = pendingOrders.findIndex((o) => o.id === orderId)
    if (idx >= 0) pendingOrders.splice(idx, 1)
  },

  getPositionsSync(accountId: string): Position[] {
    return holdings
      .filter((h) => h.accountId === accountId)
      .map((h) => {
        const inst = instrumentById(h.instrumentId)
        const currentPrice = livePrices[h.instrumentId] ?? openPrices[h.instrumentId] ?? 0
        const marketValue = currentPrice * h.quantity
        const costBasis = h.avgPrice * h.quantity
        const unrealizedPnl = marketValue - costBasis
        return {
          instrument: inst,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          currentPrice,
          marketValue,
          costBasis,
          unrealizedPnl,
          unrealizedRate: costBasis ? (unrealizedPnl / costBasis) * 100 : 0,
        }
      })
  },

  getSummarySync(accountId: string): PortfolioSummary {
    const account = accountById(accountId)
    const positions = this.getPositionsSync(accountId)
    const holdingsValue = positions.reduce((sum, p) => sum + p.marketValue, 0)
    const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
    const totalValue = account.cashBalance + holdingsValue
    // 투자원금 = 시드 + 튜토리얼 보너스 (보너스가 수익률을 부풀리지 않도록 분모에 포함)
    const capital = account.seedAmount + account.bonusTotal
    return {
      accountId,
      market: account.market,
      seedAmount: account.seedAmount,
      investedCapital: capital,
      cashBalance: account.cashBalance,
      holdingsValue,
      totalValue,
      realizedPnl: account.realizedPnl,
      unrealizedPnl,
      returnRate: capital ? ((totalValue - capital) / capital) * 100 : 0,
    }
  },

  async getTrades(accountId: string): Promise<TradeRecord[]> {
    await delay(150)
    return tradeRecords.filter((t) => t.accountId === accountId)
  },

  async getPendingOrders(accountId: string): Promise<PendingOrder[]> {
    await delay(120)
    return pendingOrders.filter((o) => o.accountId === accountId)
  },

  async getDecisionLogs(accountId: string): Promise<DecisionLog[]> {
    await delay(150)
    const tradeIds = new Set(
      tradeRecords.filter((t) => t.accountId === accountId).map((t) => t.id),
    )
    const pendingIds = new Set(
      pendingOrders.filter((o) => o.accountId === accountId).map((o) => o.id),
    )
    return decisionLogs.filter((d) => tradeIds.has(d.tradeId) || pendingIds.has(d.tradeId))
  },

  /** 로그인 사용자의 시장별 계좌 id 조회 */
  getAccountId(userId: string, market: Market): string | null {
    const acc = accounts.find((a) => a.userId === userId && a.market === market)
    return acc?.id ?? null
  },
}
