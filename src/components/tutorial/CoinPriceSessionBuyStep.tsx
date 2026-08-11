// 코인 실습 2단계 매수 — 가상 가격 세션을 만들고 지정가를 예약한 뒤 "다음 시세 보기"로 틱을 진행해 체결시킨다
import { useCallback, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { formatKRW } from '../../lib/format'
import { toUserMessage } from '../../lib/errorMessages'
import { bumpAccount } from '../../lib/accountPulse'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { getOrders } from '../../services/orderService'
import {
  advancePracticePriceTick,
  createPracticeLimitOrder,
  createPracticePriceSession,
} from '../../services/tutorialService'
import type { PracticeLimitOrderResponse, PracticePriceSessionResponse } from '../../services/tutorialTypes'

function sanitizePriceInput(value: string): string {
  return value.replace(/[^0-9.]/g, '')
}

export function CoinPriceSessionBuyStep({
  instrumentId,
  quantity,
  onFilled,
}: {
  instrumentId: number
  /** 1단계 의도에 기록한 수량 그대로 써야 한다 — chain 해석이 buyTrade·intention 수량 일치를 요구한다(026). */
  quantity: number
  /** 지정가 체결이 감지되면 호출 — 부모가 진행 상태를 다시 읽도록 트리거한다. */
  onFilled: () => void
}) {
  const [session, setSession] = useState<PracticePriceSessionResponse | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const [limitPrice, setLimitPrice] = useState('')
  const [order, setOrder] = useState<PracticeLimitOrderResponse | null>(null)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)

  const [ticking, setTicking] = useState(false)
  const [tickError, setTickError] = useState<string | null>(null)
  const [filled, setFilled] = useState(false)
  const [expired, setExpired] = useState(false)

  const handleStart = useCallback(async () => {
    setStarting(true)
    setStartError(null)
    try {
      const res = await createPracticePriceSession(instrumentId)
      setSession(res)
      setLimitPrice(String(res.currentPrice))
    } catch (e) {
      setStartError(
        toUserMessage(e, {
          INSTRUMENT_NOT_TRADABLE: '지금은 이 종목으로 실습을 시작할 수 없습니다.',
        }),
      )
    } finally {
      setStarting(false)
    }
  }, [instrumentId])

  const handlePlaceOrder = useCallback(async () => {
    if (!session) return
    const price = Number(limitPrice)
    if (!limitPrice || !(price > 0)) {
      setPlaceError('지정가를 0보다 크게 입력해 주세요.')
      return
    }
    setPlacing(true)
    setPlaceError(null)
    try {
      const res = await createPracticeLimitOrder({
        practicePriceSessionId: session.sessionId,
        instrumentId,
        quantity: String(quantity),
        limitPrice: String(price),
      })
      setOrder(res)
    } catch (e) {
      setPlaceError(toUserMessage(e))
    } finally {
      setPlacing(false)
    }
  }, [session, limitPrice, instrumentId, quantity])

  const handleNextTick = useCallback(async () => {
    if (!session || !order) return
    setTicking(true)
    setTickError(null)
    try {
      const nextSession = await advancePracticePriceTick(session.sessionId, session.currentTick + 1)
      setSession(nextSession)
      bumpTutorial()

      // 체결 알림 API가 없어 미체결 목록에서 우리 주문이 사라졌는지로 판단한다(orderService 관례와 동일).
      const page = await getOrders({ market: 'CRYPTO', limit: 50 })
      const mine = page.content.find((o) => o.orderId === order.orderId)
      if (!mine || mine.status === 'FILLED') {
        setFilled(true)
        bumpAccount()
        onFilled()
      } else if (mine.status === 'CANCELLED') {
        setExpired(true)
      }
    } catch (e) {
      setTickError(toUserMessage(e))
    } finally {
      setTicking(false)
    }
  }, [session, order, onFilled])

  const handleRestart = useCallback(() => {
    setSession(null)
    setOrder(null)
    setFilled(false)
    setExpired(false)
    setLimitPrice('')
    setPlaceError(null)
    setTickError(null)
  }, [])

  if (filled) {
    return (
      <Card accent="coin">
        <div className="space-y-1 p-5">
          <p className="text-sm text-ink">지정가 매수가 체결됐습니다.</p>
        </div>
      </Card>
    )
  }

  if (expired) {
    return (
      <Card accent="coin">
        <div className="space-y-3 p-5">
          <p className="text-sm text-ink">
            체결되지 않아 세션이 종료됐습니다. 예약했던 주문은 자동으로 취소됐습니다.
          </p>
          <Button type="button" size="sm" onClick={handleRestart}>
            다시 시작하기
          </Button>
        </div>
      </Card>
    )
  }

  if (session === null) {
    return (
      <Card accent="coin">
        <div className="space-y-3 p-5">
          <p className="text-sm leading-relaxed text-muted">
            코인은 실제 시세가 아니라 이 실습 전용 가상 시세로 진행합니다. 시작하면 매수 지정가를
            정하고, "다음 시세 보기"를 눌러 시세를 한 걸음씩 진행시켜 체결을 지켜볼 수 있습니다.
          </p>
          {startError && <p className="text-sm text-loss">{startError}</p>}
          <Button type="button" size="sm" disabled={starting} onClick={() => void handleStart()}>
            {starting ? '시작하는 중…' : '가상 시세로 실습 시작'}
          </Button>
        </div>
      </Card>
    )
  }

  if (order === null) {
    return (
      <Card accent="coin">
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3 text-sm">
            <span className="text-muted">현재 가상 시세</span>
            <span className="tabular text-ink">{formatKRW(session.currentPrice)}</span>
          </div>
          <div>
            <label htmlFor="coin-limit-price" className="mb-1.5 block text-sm font-medium text-ink">
              지정가
            </label>
            <input
              id="coin-limit-price"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={limitPrice}
              onChange={(e) => setLimitPrice(sanitizePriceInput(e.target.value))}
              className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring focus:border-coin focus:ring-4 focus:ring-coin/15"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              가상 시세가 이 가격에 닿으면 체결됩니다. 수량은 1단계에서 기록한 {quantity}개로 고정됩니다.
            </p>
          </div>
          {placeError && <p className="text-sm text-loss">{placeError}</p>}
          <Button type="button" size="sm" disabled={placing} onClick={() => void handlePlaceOrder()}>
            {placing ? '예약하는 중…' : '지정가 매수 예약'}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card accent="coin">
      <div className="space-y-4 p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-elevated px-4 py-3">
            <p className="text-xs text-muted">현재 가상 시세</p>
            <p className="tabular text-sm text-ink">{formatKRW(session.currentPrice)}</p>
          </div>
          <div className="rounded-xl bg-elevated px-4 py-3">
            <p className="text-xs text-muted">예약한 지정가</p>
            <p className="tabular text-sm text-ink">{formatKRW(order.limitPrice)}</p>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>시세 진행</span>
            <span className="tabular">
              {session.currentTick}/{session.totalTicks}틱
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-elevated">
            <div
              className="h-1.5 rounded-full bg-coin transition-all"
              style={{ width: `${(session.currentTick / session.totalTicks) * 100}%` }}
            />
          </div>
        </div>

        {tickError && <p className="text-sm text-loss">{tickError}</p>}

        <Button type="button" size="sm" disabled={ticking} onClick={() => void handleNextTick()}>
          {ticking ? '진행하는 중…' : '다음 시세 보기'}
        </Button>
      </div>
    </Card>
  )
}
