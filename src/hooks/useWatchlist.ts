// 관심목록을 읽고 종목별로 토글하는 훅 (등록·해제 중 중복 클릭을 종목 단위로 막는다)
import { useCallback, useEffect, useState } from 'react'
import {
  addWatchlistItem,
  getWatchlistItems,
  removeWatchlistItem,
} from '../services/watchlistService'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import type { WatchlistItem } from '../services/types'

/**
 * 시장 필터를 걸지 않고 전체를 한 번 읽는다 — 계약에 페이지네이션이 없고,
 * 시장 탭을 옮길 때마다 다시 부르면 ★ 상태가 깜빡인다.
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 요청 중인 instrumentId 집합. 종목별로 막아야 다른 종목의 ★ 가 함께 잠기지 않는다. */
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    let alive = true
    getWatchlistItems()
      .then((res) => {
        if (alive) setItems(res.content)
      })
      .catch((e) => {
        if (alive) setError(toUserMessage(e))
      })
    return () => {
      alive = false
    }
  }, [])

  const withBusy = useCallback((instrumentId: number, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(instrumentId)
      else next.delete(instrumentId)
      return next
    })
  }, [])

  const toggle = useCallback(
    async (instrumentId: number) => {
      if (items === null || busy.has(instrumentId)) return
      const existing = items.find((it) => it.instrumentId === instrumentId)
      withBusy(instrumentId, true)
      setError(null)
      try {
        if (existing) {
          await removeWatchlistItem(instrumentId)
          setItems((prev) => (prev ?? []).filter((it) => it.instrumentId !== instrumentId))
        } else {
          const created = await addWatchlistItem(instrumentId)
          // 서버 정렬이 createdAt 내림차순이라 새 항목은 맨 앞이다.
          setItems((prev) => [created, ...(prev ?? [])])
        }
      } catch (e) {
        // 이미 등록됨·이미 없음은 목록이 낡았다는 뜻이므로 서버 상태로 다시 맞춘다.
        if (isApiErrorCode(e, 'DUPLICATE_RESOURCE') || isApiErrorCode(e, 'WATCHLIST_ITEM_NOT_FOUND')) {
          try {
            const res = await getWatchlistItems()
            setItems(res.content)
          } catch {
            // 재조회까지 실패하면 아래 공통 오류 문구로 떨어뜨린다.
            setError(toUserMessage(e))
          }
        } else {
          setError(toUserMessage(e))
        }
      } finally {
        withBusy(instrumentId, false)
      }
    },
    [busy, items, withBusy],
  )

  const has = useCallback(
    (instrumentId: number) => (items ?? []).some((it) => it.instrumentId === instrumentId),
    [items],
  )

  return { items, error, busy, toggle, has }
}
