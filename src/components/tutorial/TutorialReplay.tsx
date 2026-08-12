// 완료된 튜토리얼을 다시 체험하는 위젯 — 완료 기록·보상은 그대로 두고(백엔드가 완료 후 의도·관찰·복기
// API 재호출을 막으므로 그 세 단계는 로컬 시뮬레이션만 한다), 매수·매도만 실제 주문으로 체결한다.
import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { TickPriceChart } from './TickPriceChart'
import { useLiveSamplePrice } from '../../hooks/useLiveSamplePrice'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { bumpAccount } from '../../lib/accountPulse'
import { placeOrder } from '../../services/orderService'
import { getHoldings } from '../../services/holdingService'
import type { FavoriteResponse } from '../../services/tutorialTypes'
import type { Market } from '../../services/types'

function sanitizeNumberInput(value: string, allowDecimal: boolean): string {
  return value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '')
}

type ReplayPhase = 'intention' | 'buy' | 'observe' | 'sell' | 'done'

export function TutorialReplay({
  market,
  favorite,
  onExit,
}: {
  market: Market
  favorite: FavoriteResponse
  onExit: () => void
}) {
  const isCrypto = market === 'CRYPTO'
  const unit = isCrypto ? '개' : '주'
  const accent = isCrypto ? 'coin' : 'brand'

  const [phase, setPhase] = useState<ReplayPhase>('intention')
  const [quantity, setQuantity] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const live = useLiveSamplePrice(favorite.instrumentId, phase === 'buy' || phase === 'observe' || phase === 'sell')

  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)
  const buyIdempotencyKey = useIdempotencyKey([market, favorite.instrumentId, 'replay-buy'])

  const [selling, setSelling] = useState(false)
  const [sellError, setSellError] = useState<string | null>(null)
  const sellIdempotencyKey = useIdempotencyKey([market, favorite.instrumentId, 'replay-sell'])

  const [answer, setAnswer] = useState('')

  const numericStopLoss = Number(stopLoss)
  const numericTakeProfit = Number(takeProfit)

  const verdict = useMemo(() => {
    if (live.latest === null || !stopLoss || !takeProfit) return null
    const distanceToStop = Math.abs(live.latest - numericStopLoss)
    const distanceToProfit = Math.abs(numericTakeProfit - live.latest)
    return distanceToStop < distanceToProfit
      ? `손절선에 더 가깝습니다 (거리 ${formatKRW(distanceToStop)})`
      : `익절선에 더 가깝습니다 (거리 ${formatKRW(distanceToProfit)})`
  }, [live.latest, numericStopLoss, numericTakeProfit, stopLoss, takeProfit])

  const handleIntentionSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const q = Number(quantity)
    const sl = Number(stopLoss)
    const tp = Number(takeProfit)
    if (!quantity || !stopLoss || !takeProfit || !(q > 0) || !(sl > 0) || !(tp > 0)) {
      setFormError('수량·손절가·익절가를 모두 0보다 크게 입력해 주세요.')
      return
    }
    if (!isCrypto && !Number.isInteger(q)) {
      setFormError('주식 수량은 정수만 입력할 수 있습니다.')
      return
    }
    // 체험 모드는 완료된 튜토리얼의 의도 기록을 다시 남기지 않는다(서버가 막는다) — 로컬에만 둔다.
    setPhase('buy')
  }

  const handleBuy = useCallback(async () => {
    setBuying(true)
    setBuyError(null)
    try {
      await placeOrder(
        { market, instrumentId: favorite.instrumentId, side: 'BUY', orderType: 'MARKET', quantity },
        buyIdempotencyKey,
      )
      bumpAccount()
      setPhase('observe')
    } catch (e) {
      setBuyError(toUserMessage(e))
    } finally {
      setBuying(false)
    }
  }, [market, favorite.instrumentId, quantity, buyIdempotencyKey])

  const handleSell = useCallback(async () => {
    setSelling(true)
    setSellError(null)
    try {
      const holdings = await getHoldings(market)
      const holding = holdings.find((h) => h.instrumentId === favorite.instrumentId)
      const sellable = holding ? Number(holding.quantity) - Number(holding.reservedQuantity) : 0
      if (!(sellable > 0)) {
        setSellError('매도 가능한 수량이 없습니다.')
        return
      }
      await placeOrder(
        { market, instrumentId: favorite.instrumentId, side: 'SELL', orderType: 'MARKET', quantity: String(sellable) },
        sellIdempotencyKey,
      )
      bumpAccount()
      setPhase('done')
    } catch (e) {
      setSellError(toUserMessage(e))
    } finally {
      setSelling(false)
    }
  }, [market, favorite.instrumentId, sellIdempotencyKey])

  const inputClass = `w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 ${
    isCrypto ? 'focus:border-coin focus:ring-4 focus:ring-coin/15' : 'focus:border-brand focus:ring-4 focus:ring-brand/15'
  }`

  return (
    <Card accent={accent}>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <Eyebrow>다시 체험하기 · {favorite.name}</Eyebrow>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            종료
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          완료 기록과 보상은 그대로 유지됩니다 — 이 체험은 진행 상태에 영향을 주지 않습니다. 매수·매도는
          실제로 체결되지만, 의도·관찰·복기는 다시 저장되지 않습니다.
        </p>

        {phase === 'intention' && (
          <form onSubmit={handleIntentionSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="replay-quantity" className="mb-1.5 block text-sm font-medium text-ink">
                수량
              </label>
              <input
                id="replay-quantity"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={isCrypto ? '0.01' : '1'}
                value={quantity}
                onChange={(e) => setQuantity(sanitizeNumberInput(e.target.value, isCrypto))}
                className={inputClass}
              />
              <span className="mt-1.5 block text-xs text-muted">{unit} 단위로 입력합니다.</span>
            </div>
            <div>
              <label htmlFor="replay-stop-loss" className="mb-1.5 block text-sm font-medium text-ink">
                손절가
              </label>
              <input
                id="replay-stop-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={stopLoss}
                onChange={(e) => setStopLoss(sanitizeNumberInput(e.target.value, true))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="replay-take-profit" className="mb-1.5 block text-sm font-medium text-ink">
                익절가
              </label>
              <input
                id="replay-take-profit"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={takeProfit}
                onChange={(e) => setTakeProfit(sanitizeNumberInput(e.target.value, true))}
                className={inputClass}
              />
            </div>
            {formError && <p className="text-sm text-loss">{formError}</p>}
            <Button type="submit">다음</Button>
          </form>
        )}

        {phase === 'buy' && (
          <div className="mt-5 space-y-3">
            <TickPriceChart
              prices={live.prices}
              latest={live.latest}
              referenceStopLoss={numericStopLoss}
              referenceTakeProfit={numericTakeProfit}
              accent={accent}
            />
            {buyError && <p className="text-sm text-loss">{buyError}</p>}
            <Button type="button" disabled={buying} onClick={() => void handleBuy()}>
              {buying ? '매수하는 중…' : `${quantity}${unit} 시장가로 매수`}
            </Button>
          </div>
        )}

        {phase === 'observe' && (
          <div className="mt-5 space-y-3">
            <TickPriceChart
              prices={live.prices}
              latest={live.latest}
              referenceStopLoss={numericStopLoss}
              referenceTakeProfit={numericTakeProfit}
              accent={accent}
            />
            {verdict && <p className="text-sm text-ink">{verdict}</p>}
            <Button type="button" onClick={() => setPhase('sell')}>
              매도하러 가기
            </Button>
          </div>
        )}

        {phase === 'sell' && (
          <div className="mt-5 space-y-3">
            <TickPriceChart prices={live.prices} latest={live.latest} accent={accent} />
            {sellError && <p className="text-sm text-loss">{sellError}</p>}
            <Button type="button" disabled={selling} onClick={() => void handleSell()}>
              {selling ? '매도하는 중…' : '지금 시장가로 매도'}
            </Button>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink">매도까지 체험을 마쳤습니다. 이번 판단은 어땠나요?</p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              placeholder="자유롭게 적어보세요(저장되지 않습니다)."
              className={`${inputClass} resize-y`}
            />
            <Button type="button" onClick={onExit}>
              체험 종료
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
