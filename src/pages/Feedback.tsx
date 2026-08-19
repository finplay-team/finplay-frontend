// 매도 체결을 골라 매도 직후 AI 복기를 보는 화면 (원장 수치·보유 구간 카드·반사실·집단 비교)
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { PostSellFeedback } from '../components/feedback/PostSellFeedback'
import { useInstruments } from '../hooks/useInstruments'
import { formatDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { formatKRW, pnlTone } from '../lib/format'
import { getTrades } from '../services/tradeService'
import type { Market, Trade } from '../services/types'

const PAGE_SIZE = 20

/** 부호를 붙인 정확한 원화 금액. formatPnl 은 만 단위로 축약해 목록 대조에는 쓸 수 없다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

export function Feedback() {
  const { index } = useInstruments()
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // 코인이 우선 시장이라 기본 탭도 코인이다(News·Trade 와 같은 기준).
  const [market, setMarket] = useState<Market>('CRYPTO')

  /**
   * **코인 매도도 대상이다.** 그전까지 이 화면은 `market: 'STOCK'` 을 고정으로 넘겼고 근거는
   * "매도 직후 피드백은 2차에서 주식 전용(코인 체결은 400)"이었는데, 백엔드 이슈 #275 로 코인
   * 체결도 400 이 아니라 **200** 이 된 뒤로 그 전제가 깨졌다. 서버는 코인 복기를 서술까지 만들어
   * 두는데 이 화면이 조회조차 하지 않아 사용자가 볼 방법이 없었다.
   *
   * 그래서 다른 화면(뉴스·모의투자)과 같은 `MarketTabs` 로 시장을 고르게 한다. 기본값도 그 둘과
   * 같은 코인이다 — 코인이 24시간이라 재생세션·장 시간과 무관하게 항상 볼 것이 있다.
   */
  const load = useCallback(
    async (cursor?: string) => {
      try {
        const page = await getTrades({ market, limit: PAGE_SIZE, cursor })
        setTrades((prev) => (cursor ? [...(prev ?? []), ...page.content] : page.content))
        setNextCursor(page.nextCursor)
        setHasNext(page.hasNext)
        setError(null)
      } catch (e) {
        setError(toUserMessage(e))
      }
    },
    [market],
  )

  // 시장을 바꾸면 목록·펼침·커서를 모두 초기화한다 — 남겨 두면 다른 시장의 체결이 펼쳐진 채로 남는다.
  useEffect(() => {
    setTrades(null)
    setSelected(null)
    setNextCursor(null)
    setHasNext(false)
    void load()
  }, [load])

  // 체결 목록에는 매수·매도가 섞여 오므로 매도만 남긴다. 서버에 side 필터가 없다.
  const sells = (trades ?? []).filter((t) => t.side === 'SELL')

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -right-24 top-20 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-5xl">
        <header>
          <Eyebrow>AI 복기</Eyebrow>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
            그 매매, 어땠나
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            투자일기와는 별개입니다. 언제 사서 언제 팔았는지·얼마를 벌거나 잃었는지 같은 원장 수치와,
            보유하는 동안 가격이 움직인 이유를 묶어 서버가 만든 복기입니다. 직접 적을 것은 없습니다.
          </p>
          {/*
            왜 매도만 있는지, 왜 일부 항목이 바로 안 채워지는지 미리 밝힌다 — 없는 것을 찾게 만들지 않는다.
            게이트 시각이 시장마다 다르다: 주식은 그 거래일 장 마감(15:30), 코인은 장이 없어 KST 자정이다.
          */}
          <p className="mt-2 text-xs leading-relaxed text-muted">
            매도 체결에만 생깁니다. 매도 후 흐름과 반사실 비교는{' '}
            {market === 'STOCK'
              ? '그 체결이 일어난 거래일의 장 마감(15:30)'
              : '그 체결이 일어난 날의 자정'}
            이 지나야 열립니다.
          </p>

          <MarketTabs market={market} onChange={setMarket} className="mt-5" />
        </header>

        {error && <p className="mt-6 text-sm text-loss">{error}</p>}

        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink">매도 체결</h2>

          {trades === null && !error && (
            <div className="mt-4 space-y-2">
              <div className="skeleton h-16" />
              <div className="skeleton h-16" />
            </div>
          )}

          {trades !== null && sells.length === 0 && (
            <Card className="mt-4" innerClassName="p-8 text-center">
              <p className="text-sm text-muted">
                아직 {market === 'STOCK' ? '주식' : '코인'} 매도 체결이 없습니다.{' '}
                {market === 'STOCK' ? '주식을' : '코인을'} 매도하면 여기에서 복기를 볼 수 있습니다.
              </p>
            </Card>
          )}

          {sells.length > 0 && (
            <ul className="mt-4 space-y-2">
              {sells.map((t) => {
                const active = selected === t.tradeId
                return (
                  <li key={t.tradeId}>
                    <button
                      type="button"
                      onClick={() => setSelected(active ? null : t.tradeId)}
                      aria-expanded={active}
                      className={`flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl px-5 py-4 text-left transition-colors duration-300 ${
                        active ? 'bg-brand-soft ring-1 ring-brand/40' : 'bg-surface hover:bg-elevated'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {index?.byId.get(t.instrumentId)?.name ?? `종목 ${t.instrumentId}`}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted tabular">
                          {formatDateTime(t.executedAt)} · {formatKRW(t.price)} ·{' '}
                          {t.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 8 })}
                          {/* 코인은 소수 수량이라 '주'가 붙으면 어색하다 — 시장별로 단위를 가른다. */}
                          {market === 'STOCK' ? '주' : '개'}
                        </span>
                      </span>
                      <span className="flex flex-none items-baseline gap-3">
                        <span
                          className={`text-sm font-semibold tabular ${
                            t.realizedPnl === null ? 'text-muted' : pnlTone(t.realizedPnl)
                          }`}
                        >
                          {t.realizedPnl === null ? '—' : signedKRW(t.realizedPnl)}
                        </span>
                        <span className="text-xs text-muted">{active ? '접기' : '복기 보기'}</span>
                      </span>
                    </button>

                    {active && (
                      <div className="mt-2">
                        {/* key 로 마운트를 분리해 다른 체결의 응답이 남지 않게 한다. */}
                        <PostSellFeedback key={t.tradeId} tradeId={t.tradeId} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {hasNext && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true)
                await load(nextCursor ?? undefined)
                setLoadingMore(false)
              }}
            >
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </Button>
          )}

          {/* 매수만 있는 페이지를 넘겨보다 매도가 나올 수 있다 — 목록이 비어 보여도 더 있을 수 있음을 알린다. */}
          {trades !== null && sells.length === 0 && hasNext && (
            <p className="mt-3 text-xs text-muted">
              이 구간에는 매도가 없습니다. 더 보기로 이전 체결을 확인할 수 있습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
