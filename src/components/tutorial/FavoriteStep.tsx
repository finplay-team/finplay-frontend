// 튜토리얼 1단계 — 종목을 검색해 실습 전용 즐겨찾기를 등록·해제하는 위젯
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { getFavorites, addFavorite, removeFavorite } from '../../services/tutorialService'
import type { FavoriteResponse } from '../../services/tutorialTypes'
import { ensureInstrumentCache } from '../../services/instrumentService'
import type { Instrument, Market } from '../../services/types'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { toUserMessage } from '../../lib/errorMessages'
import { formatDateTime } from '../../lib/datetime'

const MAX_RESULTS = 20

export function FavoriteStep({ market }: { market: Market }) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [favorites, setFavorites] = useState<FavoriteResponse[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    let alive = true
    Promise.all([ensureInstrumentCache(), getFavorites()])
      .then(([index, favs]) => {
        if (!alive) return
        setInstruments(Array.from(index.byId.values()).filter((i) => i.market === market))
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

  // 검색어가 비어 있어도 고를 게 하나도 안 보이면 사용자가 뭘 입력해야 할지 알 수 없다.
  // 비어 있을 땐 이 시장의 종목을 코드순으로 그냥 보여준다 — 검색은 그 목록을 좁히는 용도다.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? instruments.filter((i) => i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q))
      : [...instruments].sort((a, b) => a.symbol.localeCompare(b.symbol))
    return pool.slice(0, MAX_RESULTS)
  }, [instruments, query])

  const isFavorited = (instrumentId: number) => favorites.some((f) => f.instrumentId === instrumentId)

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
      if (isFavorited(instrumentId)) {
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
          INSTRUMENT_NOT_TRADABLE: '거래정지 종목은 즐겨찾기에 등록할 수 없습니다.',
          DUPLICATE_RESOURCE: '이미 등록된 종목입니다.',
        }),
      )
    } finally {
      setInstrumentBusy(instrumentId, false)
    }
  }

  const focusRing = market === 'CRYPTO' ? 'focus:border-coin focus:ring-coin/15' : 'focus:border-brand focus:ring-brand/15'
  const accent = market === 'CRYPTO' ? 'coin' : 'brand'

  return (
    <div className="space-y-6">
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명 또는 코드로 검색"
          className={`w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 ${focusRing}`}
        />
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}

      <Card accent={accent}>
        <p className="px-4 pt-4 text-xs text-muted">
          {query.trim() ? '검색 결과' : `${market === 'CRYPTO' ? '코인' : '주식'} 종목 목록 — 아무거나 골라 등록하면 1단계가 끝납니다.`}
        </p>
        <ul className="divide-y divide-line">
          {loading ? (
            <li className="px-4 py-4 text-sm text-muted">종목을 불러오는 중입니다.</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-4 text-sm text-muted">검색 결과가 없습니다.</li>
          ) : (
            results.map((instrument) => {
              const favorited = isFavorited(instrument.instrumentId)
              const rowBusy = busy.has(instrument.instrumentId)
              return (
                <li key={instrument.instrumentId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[15px] text-ink">{instrument.name}</p>
                    <p className="text-xs text-muted">{instrument.symbol}</p>
                  </div>
                  <Button
                    variant={favorited ? 'ghost' : 'soft'}
                    size="sm"
                    disabled={rowBusy}
                    onClick={() => handleToggle(instrument.instrumentId)}
                  >
                    {favorited ? '해제' : '즐겨찾기'}
                  </Button>
                </li>
              )
            })
          )}
        </ul>
      </Card>

      <div className="space-y-3">
        <p className="text-sm text-muted">
          이 즐겨찾기는 실습 전용이며 서버 재시작 시 초기화될 수 있습니다.
        </p>
        <Card accent={accent}>
          <ul className="divide-y divide-line">
            {loading ? (
              <li className="px-4 py-4 text-sm text-muted">불러오는 중입니다.</li>
            ) : favorites.length === 0 ? (
              <li className="px-4 py-4 text-sm text-muted">
                아직 즐겨찾기한 종목이 없습니다. 위 목록에서 골라 등록해 보세요.
              </li>
            ) : (
              favorites.map((favorite) => {
                const rowBusy = busy.has(favorite.instrumentId)
                return (
                  <li key={favorite.favoriteId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-[15px] text-ink">{favorite.name}</p>
                      <p className="text-xs text-muted">
                        {favorite.symbol} · {formatDateTime(favorite.createdAt)} 등록
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => handleToggle(favorite.instrumentId)}
                    >
                      해제
                    </Button>
                  </li>
                )
              })
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
