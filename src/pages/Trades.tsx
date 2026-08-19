// 시장별 전체 체결 내역을 커서로 끝까지 모아 한 번에 보여주는 화면 (포트폴리오 미리보기의 "전체보기")
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { useInstruments } from '../hooks/useInstruments'
import { formatDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { formatKRW, pnlTone } from '../lib/format'
import { sideLabels } from '../lib/labels'
import { getTrades } from '../services/tradeService'
import type { Market, Trade } from '../services/types'

/** 안전장치일 뿐 정상 동작에서 걸리지 않는다 — 100건씩 최대 50페이지(5,000건)까지만 훑는다. */
const MAX_PAGES = 50
const FETCH_PAGE_SIZE = 100

/** 부호를 붙인 정확한 원화 금액. Portfolio.tsx 의 같은 이름 함수와 동일한 표기 규칙이다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

export function Trades() {
  const [market, setMarket] = useState<Market>('CRYPTO')
  const [reloadKey, setReloadKey] = useState(0)

  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { index } = useInstruments()

  useEffect(() => {
    let cancelled = false
    setTrades(null)
    setLoadError(null)
    void (async () => {
      const all: Trade[] = []
      let cursor: string | null | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await getTrades({ market, cursor, limit: FETCH_PAGE_SIZE })
        if (cancelled) return
        all.push(...result.content)
        if (!result.hasNext) break
        cursor = result.nextCursor
      }
      if (!cancelled) setTrades(all)
    })().catch((e: unknown) => {
      if (!cancelled) setLoadError(toUserMessage(e))
    })
    return () => {
      cancelled = true
    }
  }, [market, reloadKey])

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>체결 내역</Eyebrow>
            <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
              전체 체결 내역
            </h1>
            <p className="mt-3 text-sm text-muted">
              최신 체결이 맨 위입니다. 매도 복기·투자일기 작성은 포트폴리오 화면에서 할 수 있습니다.
            </p>
          </div>
          <MarketTabs market={market} onChange={setMarket} />
        </header>

        <section className="mt-8">
          {loadError && (
            <Card innerClassName="p-8 text-center">
              <p className="text-sm text-ink">{loadError}</p>
              <div className="mt-5 flex justify-center">
                <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
                  다시 시도
                </Button>
              </div>
            </Card>
          )}

          {!loadError && (
            <Card innerClassName="p-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="px-4 py-3 text-left font-medium">체결시각</th>
                      <th className="px-4 py-3 text-left font-medium">구분</th>
                      <th className="px-4 py-3 text-left font-medium">종목</th>
                      <th className="px-4 py-3 text-right font-medium">단가</th>
                      <th className="px-4 py-3 text-right font-medium">수량</th>
                      <th className="px-4 py-3 text-right font-medium">거래금액</th>
                      <th className="px-4 py-3 text-right font-medium">수수료</th>
                      <th className="px-4 py-3 text-right font-medium">실현손익</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {trades === null ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-muted">
                          체결 내역을 불러오는 중입니다.
                        </td>
                      </tr>
                    ) : trades.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-muted">
                          아직 체결된 거래가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      trades.map((trade) => (
                        <tr key={trade.tradeId}>
                          <td className="px-4 py-3 text-muted tabular">
                            {formatDateTime(trade.executedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                trade.side === 'BUY' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                              }`}
                            >
                              {sideLabels[trade.side]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink">
                            {index?.byId.get(trade.instrumentId)?.name ?? `#${trade.instrumentId}`}
                          </td>
                          <td className="px-4 py-3 text-right text-ink tabular">
                            {formatKRW(trade.price)}
                          </td>
                          <td className="px-4 py-3 text-right text-ink tabular">
                            {formatQty(trade.quantity)}
                          </td>
                          <td className="px-4 py-3 text-right text-ink tabular">
                            {formatKRW(trade.amount)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted tabular">
                            {formatKRW(trade.fee)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular ${
                              trade.realizedPnl === null ? 'text-muted' : pnlTone(trade.realizedPnl)
                            }`}
                          >
                            {trade.realizedPnl === null ? '—' : signedKRW(trade.realizedPnl)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {trades !== null && trades.length > 0 && (
            <p className="mt-3 text-xs text-muted tabular">총 {trades.length}건</p>
          )}
        </section>
      </div>
    </div>
  )
}
