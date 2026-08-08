// 관심목록 등록·조회·해제 서비스 (WATCH-001~003, MySQL 영속화 — 튜토리얼 전용 favorites 와 다른 기능이다)
import { api } from '../lib/apiClient'
import type { Market, WatchlistItem, WatchlistItemList } from './types'

/**
 * 관심목록 등록. 이미 있으면 409 DUPLICATE_RESOURCE 이고 기존 행을 돌려주지 않는다(upsert 아님).
 *
 * **거래 가능 여부(tradable)를 검사하지 않는 것이 계약이다.** 거래정지 종목도 담을 수 있어야 하므로
 * Trade 화면의 tradable 가드를 여기에 복사하면 계약을 임의로 좁히게 된다.
 */
export function addWatchlistItem(instrumentId: number): Promise<WatchlistItem> {
  return api.post<WatchlistItem>('/watchlist-items', { instrumentId })
}

/** market 은 선택 — 생략하면 두 시장 전체다. 정렬은 서버가 보장하므로 재정렬하지 않는다. */
export function getWatchlistItems(market?: Market): Promise<WatchlistItemList> {
  return api.get<WatchlistItemList>('/watchlist-items', { query: { market } })
}

/**
 * 관심목록 해제 — 204, 본문 없음.
 * 경로 변수는 **종목 id** 다. 응답으로 받은 watchlistItemId 를 넣으면 값이 달라서
 * 조용히 다른 종목을 지우거나 404 가 난다.
 * 없거나 타인 소유면 소유 여부를 노출하지 않고 404 WATCHLIST_ITEM_NOT_FOUND 다.
 */
export function removeWatchlistItem(instrumentId: number): Promise<void> {
  return api.del<void>(`/watchlist-items/${instrumentId}`)
}
