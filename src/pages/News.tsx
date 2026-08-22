// 시장 브리핑과 종목별 뉴스 요약을 한 화면에서 골라 보는 뉴스 화면
import { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { MarketBriefing } from '../components/feedback/MarketBriefing'
import { NewsSummary } from '../components/feedback/NewsSummary'
import { useInstruments } from '../hooks/useInstruments'
import { toUserMessage } from '../lib/errorMessages'
import type { Instrument, Market } from '../services/types'

export function News() {
  const [market, setMarket] = useState<Market>('CRYPTO')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { index, loading, error } = useInstruments()

  const instruments = useMemo<Instrument[]>(
    () =>
      index
        ? [...index.byId.values()]
            // 튜토리얼 전용 샘플 종목(031)은 실제 뉴스 화면에 섞이면 안 된다 — 여기서 항상 제외한다.
            .filter((i) => i.market === market && !i.isTutorialSample)
            .sort((a, b) => a.instrumentId - b.instrumentId)
        : [],
    [index, market],
  )

  // 시장을 바꾸면 앞 시장의 종목 선택은 무효다.
  useEffect(() => {
    setSelectedId(null)
  }, [market])
  useEffect(() => {
    if (selectedId === null && instruments.length > 0) setSelectedId(instruments[0].instrumentId)
  }, [selectedId, instruments])

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -left-24 top-16 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-5xl">
        <header className="text-center">
          <Eyebrow>뉴스</Eyebrow>
          <h1 className="mt-4 font-display text-[26px] font-semibold text-ink">
            무슨 일이 있었나
          </h1>
          <MarketTabs market={market} onChange={setMarket} className="mt-4" />
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted">
            시장 전체 소식을 먼저 보고, 종목을 고르면 그 종목의 뉴스와 요약이 이어집니다. 주식은
            재생 중인 원본 거래일 기준이고 코인은 최근 24시간 기준입니다.
          </p>
        </header>

        {/* 1. 시장 단위 브리핑 */}
        <div className="mt-8">
          <MarketBriefing market={market} />
        </div>

        {/* 2. 종목 선택 — 칩으로 두어 한눈에 고르게 한다 */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-ink">종목별 소식</h2>
          {error && <p className="mt-3 text-sm text-loss">{toUserMessage(error)}</p>}

          {loading ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className="skeleton h-8 w-24" />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {instruments.map((i) => {
                const active = i.instrumentId === selectedId
                return (
                  <button
                    key={i.instrumentId}
                    type="button"
                    onClick={() => setSelectedId(i.instrumentId)}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-300 ${
                      active
                        ? market === 'CRYPTO'
                          ? 'bg-coin-soft text-coin ring-1 ring-coin/40'
                          : 'bg-brand-soft text-brand ring-1 ring-brand/40'
                        : 'bg-white/[0.04] text-muted ring-1 ring-white/[0.08] hover:text-ink'
                    }`}
                  >
                    {i.name}
                    <span className="ml-1.5 text-[11px] tabular opacity-70">{i.symbol}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-5">
            {selectedId === null ? (
              <Card innerClassName="p-8 text-center">
                <p className="text-sm text-muted">종목을 고르면 그 종목의 소식이 표시됩니다.</p>
              </Card>
            ) : (
              // key 를 주어 종목이 바뀌면 컴포넌트가 새로 마운트되게 한다 — 앞 종목의 요약이 남지 않는다.
              <NewsSummary key={selectedId} instrumentId={selectedId} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
