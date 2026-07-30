// 주식/코인 모의 매매 페이지 — 종목 선택, 실시간 시세, 매수/매도 주문, 투자일기 기록
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useLivePrices } from '../hooks/useLivePrices'
import { tradeService } from '../services/tradeService'
import type {
  DecisionBasis,
  Instrument,
  Market,
  OrderSide,
  OrderType,
} from '../services/types'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Tabs } from '../components/ui/Tabs'
import { Button, LinkButton } from '../components/ui/Button'
import { basisLabels, basisOrder } from '../lib/labels'
import { formatKRW, formatPercent, pnlTone } from '../lib/format'

/** 수량 표기 — 정수는 그대로, 소수(코인)는 불필요한 0 제거 */
function formatQty(q: number): string {
  if (Number.isInteger(q)) return q.toLocaleString('ko-KR')
  return q.toFixed(8).replace(/\.?0+$/, '')
}

export function Trade() {
  const { user } = useAuth()
  const [market, setMarket] = useState<Market>('STOCK')
  const { quotes, version, refresh } = useLivePrices(market)

  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 주문 폼 상태
  const [side, setSide] = useState<OrderSide>('BUY')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [qty, setQty] = useState('')
  const [basis, setBasis] = useState<DecisionBasis | null>(null)
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const accountId = user ? tradeService.getAccountId(user.id, market) : null

  // 시장 변경 시 종목 목록 로드 + 선택 초기화
  useEffect(() => {
    let alive = true
    tradeService.getInstruments(market).then((list) => {
      if (!alive) return
      setInstruments(list)
      setSelectedId(list[0]?.id ?? null)
    })
    return () => {
      alive = false
    }
  }, [market])

  const selected = instruments.find((i) => i.id === selectedId) ?? null
  const quote = quotes.find((q) => q.instrumentId === selectedId) ?? null

  // 종목 선택 시 지정가 기본값을 현재가로 채움
  useEffect(() => {
    if (quote) setLimitPrice(String(quote.price))
    setMessage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const summary = useMemo(
    () => (accountId ? tradeService.getSummarySync(accountId) : null),
    [accountId, version],
  )
  const positions = useMemo(
    () => (accountId ? tradeService.getPositionsSync(accountId) : []),
    [accountId, version],
  )
  const heldQty = selected
    ? positions.find((p) => p.instrument.id === selected.id)?.quantity ?? 0
    : 0

  const orderPrice =
    orderType === 'LIMIT' ? Number(limitPrice) || 0 : quote?.price ?? 0
  const quantityNum = Number(qty) || 0
  const estAmount = orderPrice * quantityNum

  const submit = async () => {
    if (!accountId || !selected) return
    setMessage(null)
    if (quantityNum <= 0) {
      setMessage({ tone: 'err', text: '수량을 입력해 주세요.' })
      return
    }
    setSubmitting(true)
    try {
      const result = await tradeService.placeOrder({
        accountId,
        instrumentId: selected.id,
        side,
        orderType,
        quantity: quantityNum,
        limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
        decision: basis ? { basis, memo: memo.trim() } : undefined,
      })
      refresh()
      setQty('')
      setMemo('')
      setBasis(null)
      if (result.status === 'FILLED' && result.trade) {
        setMessage({
          tone: 'ok',
          text: `${selected.name} ${side === 'BUY' ? '매수' : '매도'} 체결 · ${formatKRW(
            Math.round(result.trade.price),
          )} × ${formatQty(result.trade.quantity)}`,
        })
      } else {
        setMessage({
          tone: 'ok',
          text: `지정가 주문 접수 · 현재가가 ${formatKRW(Number(limitPrice))}에 도달하면 체결됩니다.`,
        })
      }
    } catch (err) {
      setMessage({ tone: 'err', text: err instanceof Error ? err.message : '주문 실패' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>모의 거래</Eyebrow>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight md:text-5xl">거래</h1>
            <p className="mt-3 text-sm text-muted">
              실시간(시뮬레이션) 시세로 매수·매도해 보세요. 판단 근거를 남기면 투자일기로 기록됩니다.
            </p>
          </div>
          <Tabs
            items={[
              { value: 'STOCK', label: '주식' },
              { value: 'CRYPTO', label: '코인' },
            ]}
            value={market}
            onChange={(v) => setMarket(v as Market)}
          />
        </div>

        {/* 계좌 요약 */}
        {summary && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="총 평가자산" value={formatKRW(Math.round(summary.totalValue))} />
            <MiniStat label="주문가능 현금" value={formatKRW(Math.round(summary.cashBalance))} />
            <MiniStat
              label="평가손익"
              value={`${summary.unrealizedPnl >= 0 ? '+' : '−'}${formatKRW(
                Math.abs(Math.round(summary.unrealizedPnl)),
              )}`}
              tone={pnlTone(summary.unrealizedPnl)}
            />
            <MiniStat
              label="수익률"
              value={formatPercent(summary.returnRate)}
              tone={pnlTone(summary.returnRate)}
            />
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* 종목 목록 */}
          <Card>
            <div className="divide-y divide-line">
              <div className="px-5 py-3 text-xs font-medium uppercase tracking-eyebrow text-muted">
                종목 · 현재가
              </div>
              {instruments.map((inst) => {
                const q = quotes.find((x) => x.instrumentId === inst.id)
                const active = inst.id === selectedId
                return (
                  <button
                    key={inst.id}
                    onClick={() => setSelectedId(inst.id)}
                    className={`flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-300 ${
                      active ? 'bg-brand-soft/60' : 'hover:bg-black/[0.02]'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{inst.name}</p>
                      <p className="text-xs text-muted">{inst.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-semibold tabular">
                        {q ? formatKRW(q.price) : '—'}
                      </p>
                      {q && (
                        <p className={`text-xs tabular ${pnlTone(q.changeRate)}`}>
                          {formatPercent(q.changeRate)}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* 주문 패널 */}
          <Card accent={market === 'STOCK' ? 'stock' : 'coin'}>
            {selected ? (
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted">{selected.symbol}</p>
                    <h2 className="font-display text-2xl font-semibold">{selected.name}</h2>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-semibold tabular">
                      {quote ? formatKRW(quote.price) : '—'}
                    </p>
                    {quote && (
                      <p className={`text-sm tabular ${pnlTone(quote.changeRate)}`}>
                        {formatPercent(quote.changeRate)}
                      </p>
                    )}
                  </div>
                </div>

                {/* 매수/매도 */}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {(['BUY', 'SELL'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`rounded-2xl py-2.5 text-sm font-medium transition-all duration-300 ${
                        side === s
                          ? s === 'BUY'
                            ? 'bg-rose-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-black/[0.04] text-muted'
                      }`}
                    >
                      {s === 'BUY' ? '매수' : '매도'}
                    </button>
                  ))}
                </div>

                {/* 시장가/지정가 */}
                <div className="mt-3 inline-flex rounded-full bg-black/[0.04] p-1 text-sm">
                  {(['MARKET', 'LIMIT'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOrderType(t)}
                      className={`rounded-full px-4 py-1.5 transition-all duration-300 ${
                        orderType === t ? 'bg-white text-ink shadow-soft-sm' : 'text-muted'
                      }`}
                    >
                      {t === 'MARKET' ? '시장가' : '지정가'}
                    </button>
                  ))}
                </div>

                {orderType === 'LIMIT' && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm text-muted">지정가 (원)</span>
                    <input
                      type="number"
                      value={limitPrice}
                      step={selected.tickSize}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] tabular outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                  </label>
                )}

                <label className="mt-4 block">
                  <span className="mb-1.5 flex items-center justify-between text-sm text-muted">
                    <span>수량</span>
                    <span className="text-xs">
                      {side === 'BUY'
                        ? `주문가능 ${summary ? formatKRW(Math.round(summary.cashBalance)) : '—'}`
                        : `보유 ${formatQty(heldQty)}`}
                    </span>
                  </span>
                  <input
                    type="number"
                    value={qty}
                    min={0}
                    step={market === 'CRYPTO' ? 0.0001 : 1}
                    placeholder={market === 'CRYPTO' ? '0.0001' : '0'}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] tabular outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </label>

                <div className="mt-3 flex items-center justify-between rounded-2xl bg-canvas px-4 py-3 text-sm">
                  <span className="text-muted">예상 주문금액</span>
                  <span className="font-display font-semibold tabular">
                    {formatKRW(Math.round(estAmount))}
                  </span>
                </div>

                {/* 투자일기 */}
                <div className="mt-5">
                  <p className="text-sm font-medium">투자일기 (선택)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {basisOrder.map((b) => (
                      <button
                        key={b}
                        onClick={() => setBasis(basis === b ? null : b)}
                        className={`rounded-full px-3 py-1 text-xs transition-colors duration-200 ${
                          basis === b ? 'bg-ink text-white' : 'bg-black/[0.04] text-muted'
                        }`}
                      >
                        {basisLabels[b]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    placeholder="이 매매를 하는 이유를 남겨보세요."
                    className="mt-2 w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </div>

                {message && (
                  <div
                    className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                      message.tone === 'ok'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <Button
                  onClick={submit}
                  disabled={submitting}
                  className={`mt-5 w-full ${
                    side === 'BUY' ? '!bg-rose-500 hover:!bg-rose-600' : '!bg-blue-500 hover:!bg-blue-600'
                  }`}
                >
                  {submitting
                    ? '처리 중…'
                    : `${selected.name} ${side === 'BUY' ? '매수' : '매도'}`}
                </Button>
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-muted">종목을 선택해 주세요.</div>
            )}
          </Card>
        </div>

        <div className="mt-6 text-center">
          <LinkButton to="/portfolio" variant="ghost" withIcon>
            내 포트폴리오 보기
          </LinkButton>
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold tabular ${tone ?? 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}
