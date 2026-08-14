// 튜토리얼 1단계 — 연습할 종목을 하나 골라 실습 전용 선택(내부적으로는 즐겨찾기 API)을 등록·해제하는 위젯
import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { getFavorites, addFavorite, removeFavorite } from '../../services/tutorialService'
import type { FavoriteResponse } from '../../services/tutorialTypes'
import { ensureInstrumentCache } from '../../services/instrumentService'
import type { Instrument, Market } from '../../services/types'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { toUserMessage } from '../../lib/errorMessages'

export function FavoriteStep({ market }: { market: Market }) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [favorites, setFavorites] = useState<FavoriteResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    let alive = true
    Promise.all([ensureInstrumentCache(), getFavorites()])
      .then(([index, favs]) => {
        if (!alive) return
        // 튜토리얼은 실제 종목을 다루지 않는다 — 샘플 종목(031)만 고른다(실제 종목과 섞여 보이면
        // 사용자가 실습 중 실제 자산을 건드리는 것으로 오해할 수 있다). 시장당 3개뿐이라 검색 없이
        // 실거래 화면(Trade.tsx)처럼 목록에서 바로 골라 클릭하는 방식으로 충분하다.
        setInstruments(
          Array.from(index.byId.values())
            .filter((i) => i.market === market && i.isTutorialSample)
            .sort((a, b) => a.symbol.localeCompare(b.symbol)),
        )
        setFavorites(favs.filter((f) => f.market === market))
      })
      .catch((e) => {
        if (alive) setError(toUserMessage(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [market])

  const isSelected = (instrumentId: number) => favorites.some((f) => f.instrumentId === instrumentId)

  const setInstrumentBusy = (instrumentId: number, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(instrumentId)
      else next.delete(instrumentId)
      return next
    })
  }

  const handleToggle = async (instrumentId: number) => {
    if (busy.has(instrumentId)) return
    setInstrumentBusy(instrumentId, true)
    setError(null)
    try {
      if (isSelected(instrumentId)) {
        await removeFavorite(instrumentId)
        setFavorites((prev) => prev.filter((f) => f.instrumentId !== instrumentId))
      } else {
        const created = await addFavorite(instrumentId)
        setFavorites((prev) => [created, ...prev])
      }
      bumpTutorial()
    } catch (e) {
      setError(
        toUserMessage(e, {
          INSTRUMENT_NOT_TRADABLE: '거래정지 종목은 선택할 수 없습니다.',
          DUPLICATE_RESOURCE: '이미 선택된 종목입니다.',
        }),
      )
    } finally {
      setInstrumentBusy(instrumentId, false)
    }
  }

  const accent = market === 'CRYPTO' ? 'coin' : 'brand'

  return (
    <div className="space-y-3">
      {/* 설명은 목록 바로 위에 — 무엇을 왜 고르는지 알고 나서 바로 아래 버튼을 누르게 한다. */}
      <p className="text-sm leading-relaxed text-muted">
        연습할 {market === 'CRYPTO' ? '코인' : '주식'}을 하나 골라주세요. 아래에서 하나를 눌러 "선택"하면
        1단계가 끝나고 다음 단계(매수 연습)로 넘어갈 수 있어요.
        <br />
        <span className="text-xs text-muted/80">
          여기서 고른 종목은 이 실습에서만 써요 — 실제 거래 화면의 관심종목(⭐)과는 다른 기능이에요.
        </span>
      </p>

      {error && <p className="text-sm text-loss">{error}</p>}

      <Card accent={accent}>
        <ul className="divide-y divide-line">
          {loading ? (
            <li className="px-4 py-4 text-sm text-muted">종목을 불러오는 중입니다.</li>
          ) : instruments.length === 0 ? (
            <li className="px-4 py-4 text-sm text-muted">고를 수 있는 종목이 없습니다.</li>
          ) : (
            instruments.map((instrument) => {
              const selected = isSelected(instrument.instrumentId)
              const rowBusy = busy.has(instrument.instrumentId)
              // tradable=false 샘플 종목(031)은 목록에 보이지만 선택할 수 없다 — 숨기지 않고 버튼만 막는다.
              const selectable = instrument.tradable
              return (
                <li key={instrument.instrumentId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[15px] text-ink">
                      {instrument.name}
                      <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
                        연습용
                      </span>
                    </p>
                    <p className="text-xs text-muted">{instrument.symbol}</p>
                  </div>
                  <Button
                    variant={selected ? 'ghost' : 'soft'}
                    size="sm"
                    disabled={rowBusy || !selectable}
                    onClick={() => handleToggle(instrument.instrumentId)}
                  >
                    {selected ? '선택됨 · 해제' : '선택하기'}
                  </Button>
                </li>
              )
            })
          )}
        </ul>
      </Card>
    </div>
  )
}
