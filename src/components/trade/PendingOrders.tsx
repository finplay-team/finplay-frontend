// 코인 지정가 미체결 주문 목록과 정정·취소 패널 (체결 알림이 없어 폴링으로만 체결을 감지한다)
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { formatDateTime } from '../../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { formatKRW } from '../../lib/format'
import { sideLabels } from '../../lib/labels'
import { getCachedInstrument } from '../../services/instrumentService'
import {
  amendLimitOrder,
  cancelLimitOrder,
  getPendingOrders,
} from '../../services/orderService'
import type { Market, OrderSummary } from '../../services/types'

/** 체결·취소는 서버 내부 이벤트라 응답으로 알 수 없다. 이 주기가 유일한 감지 수단이다. */
const POLL_MS = 5_000
const QTY_DECIMALS = 8

interface Props {
  market: Market
  /** 주문 생성 등 외부 사건이 있을 때 올려 주면 즉시 다시 읽는다. */
  refreshNonce: number
  /** 정정·취소가 성공하면 부모가 계좌·보유를 다시 읽어야 한다 (예약분이 응답에 안 실려 온다). */
  onChanged: () => void
  /** Trade 화면 팝업 안에 끼워 넣을 때 — 팝업이 이미 제목·테두리를 갖고 있어 자체 Card 와 제목 행을 생략한다. */
  bare?: boolean
}

function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: QTY_DECIMALS })
}

/** 8자리 초과·음수를 입력 단계에서 잘라낸다 (서버는 400 을 낸다). */
function cleanDecimal(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    const [whole, frac = ''] = cleaned.split('.')
    cleaned = `${whole}.${frac.slice(0, QTY_DECIMALS)}`
  }
  return cleaned
}

export function PendingOrders({ market, refreshNonce, onChanged, bare = false }: Props) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const page = await getPendingOrders({ market })
      setOrders(page.content)
      setNextCursor(page.nextCursor)
      setHasNext(page.hasNext)
      setListError(null)
    } catch (e) {
      setListError(toUserMessage(e))
    }
  }, [market])

  // 폴링. 편집 중에는 목록을 갈아치우지 않는다 — 입력 중인 행이 사라지면 값을 잃는다.
  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (editingId === null) void load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load, refreshNonce, editingId])

  const loadMore = useCallback(async () => {
    if (!hasNext || !nextCursor) return
    try {
      const page = await getPendingOrders({ market, cursor: nextCursor })
      setOrders((prev) => [...(prev ?? []), ...page.content])
      setNextCursor(page.nextCursor)
      setHasNext(page.hasNext)
    } catch (e) {
      setListError(toUserMessage(e))
    }
  }, [hasNext, market, nextCursor])

  const startEdit = (order: OrderSummary) => {
    setEditingId(order.orderId)
    setEditQty(String(order.quantity))
    setEditPrice(String(order.limitPrice ?? ''))
    setRowError(null)
  }

  /** 체결·취소로 사라진 주문에 요청하면 409 다. 그 경우 목록을 다시 읽어 현실과 맞춘다. */
  const handleGone = useCallback(
    async (e: unknown) => {
      if (
        isApiErrorCode(e, 'ORDER_ALREADY_FILLED') ||
        isApiErrorCode(e, 'ORDER_ALREADY_CANCELLED') ||
        isApiErrorCode(e, 'NOT_FOUND')
      ) {
        setRowError('이미 체결되거나 취소된 주문입니다. 목록을 새로 불러왔습니다.')
        await load()
        onChanged()
        return true
      }
      return false
    },
    [load, onChanged],
  )

  const submitEdit = useCallback(
    async (orderId: number) => {
      if (busyRef.current) return
      // 둘 다 비우면 400 이므로 최소 하나는 값이 있어야 한다.
      if (editQty.trim() === '' && editPrice.trim() === '') {
        setRowError('수량이나 지정가 중 하나는 입력해 주세요.')
        return
      }
      busyRef.current = true
      setBusy(true)
      setRowError(null)
      try {
        await amendLimitOrder(orderId, {
          quantity: editQty.trim() === '' ? undefined : editQty.trim(),
          limitPrice: editPrice.trim() === '' ? undefined : editPrice.trim(),
        })
        setEditingId(null)
        await load()
        onChanged()
      } catch (e) {
        if (!(await handleGone(e))) setRowError(toUserMessage(e))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [editPrice, editQty, handleGone, load, onChanged],
  )

  const submitCancel = useCallback(
    async (orderId: number) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setRowError(null)
      try {
        await cancelLimitOrder(orderId)
        await load()
        onChanged()
      } catch (e) {
        if (!(await handleGone(e))) setRowError(toUserMessage(e))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [handleGone, load, onChanged],
  )

  const content = (
    <div className={bare ? 'p-5' : 'p-6'}>
        {!bare && (
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-base font-semibold">미체결 지정가 주문</h3>
            <span className="text-[10px] text-muted">5초마다 갱신</span>
          </div>
        )}

        {listError && <p className="mt-3 text-sm text-rose-300">{listError}</p>}
        {rowError && <p className="mt-3 text-sm text-rose-300">{rowError}</p>}

        {orders === null && !listError && (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        )}

        {orders !== null && orders.length === 0 && (
          <p className={`whitespace-pre-line text-sm leading-relaxed text-muted ${bare ? '' : 'mt-4'}`}>
            {'미체결 주문이 없습니다.\n지정가로 주문하면 체결 전까지 여기에 표시됩니다.'}
          </p>
        )}

        {orders !== null && orders.length > 0 && (
          <ul className="mt-4 space-y-2">
            {orders.map((order) => {
              const instrument = getCachedInstrument(order.instrumentId)
              const editing = editingId === order.orderId
              return (
                <li key={order.orderId} className="rounded-xl bg-elevated p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink">
                      {instrument?.name ?? `종목 ${order.instrumentId}`}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {instrument?.symbol}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        order.side === 'BUY' ? 'text-gain' : 'text-loss'
                      }`}
                    >
                      {sideLabels[order.side]}
                    </span>
                  </div>

                  {!editing && (
                    <>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-muted">지정가</dt>
                          <dd className="tabular text-ink">
                            {order.limitPrice === null ? '—' : formatKRW(order.limitPrice)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">수량</dt>
                          <dd className="tabular text-ink">{formatQty(order.quantity)}</dd>
                        </div>
                      </dl>
                      <p className="mt-1.5 text-[10px] text-muted">
                        {formatDateTime(order.requestedAt)} 주문
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(order)}
                        >
                          정정
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void submitCancel(order.orderId)}
                        >
                          취소
                        </Button>
                      </div>
                    </>
                  )}

                  {editing && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs text-muted">
                        지정가
                        <input
                          value={editPrice}
                          onChange={(e) => setEditPrice(cleanDecimal(e.target.value))}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm tabular text-ink"
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        수량
                        <input
                          value={editQty}
                          onChange={(e) => setEditQty(cleanDecimal(e.target.value))}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm tabular text-ink"
                        />
                      </label>
                      {/* 수정 이력이 저장되지 않아 되돌리기가 불가능하다는 사실을 알린다. */}
                      <p className="text-[10px] leading-relaxed text-muted">
                        정정하면 이전 가격·수량은 조회할 수 없습니다.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void submitEdit(order.orderId)}
                        >
                          {busy ? '처리 중…' : '저장'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null)
                            setRowError(null)
                          }}
                        >
                          되돌리기
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {hasNext && (
          <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={() => void loadMore()}>
            더 보기
          </Button>
        )}
    </div>
  )

  if (bare) return content
  return <Card>{content}</Card>
}
