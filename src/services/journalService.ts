// 투자일기 목록·상세·작성·수정 서비스 (JOUR-001~006 — 통합 journalId 경로가 없어 체결 ID로 분기한다)
import { api } from '../lib/apiClient'
import type {
  BuyJournalDetail,
  JournalPage,
  JournalType,
  JournalWriteRequest,
  Market,
  SellJournalDetail,
} from './types'

/**
 * POST 201 응답은 4필드다 — **updatedAt 이 없다.**
 * 목록 항목(6필드)에 그대로 꽂으면 날짜 포맷 함수가 undefined 를 받아 깨지므로
 * 작성 직후에는 updatedAt 을 createdAt 으로 채우거나 목록을 다시 읽어야 한다.
 */
export type BuyJournalCreated = Omit<BuyJournalDetail, 'updatedAt'>
export type SellJournalCreated = Omit<SellJournalDetail, 'updatedAt'>

/**
 * 작성·수정 경로는 회고 PK 가 아니라 **체결 ID** 를 쓰고, 타입마다 경로 꼬리가 다르다.
 * 목록 항목의 buyTradeId·sellTradeId 중 하나는 항상 null 이므로 journalType 으로 먼저 분기해야
 * `/trades/null/journal` 같은 요청을 만들지 않는다.
 */
function writePath(journalType: JournalType, tradeId: number): string {
  return journalType === 'BUY' ? `/trades/${tradeId}/journal` : `/trades/${tradeId}/sell-journal`
}

/**
 * GET /api/journal — market 필수. 매수·매도 회고가 한 목록으로 병합돼 온다.
 *
 * limit 은 서버가 클램프하지 않고 400 을 내므로 클라이언트가 1..100 으로 강제한다
 * (GET /api/rankings 는 반대로 서버가 클램핑하므로 이 클램프를 공유하면 안 된다).
 * cursor 는 직접 조립하지 않고 이전 응답의 nextCursor 를 그대로 되돌려 보낸다 —
 * 매수·매도가 섞인 목록에서 어느 체결 ID 가 들어가는지는 서버 판단이다.
 * 빈 문자열 cursor 의 동작이 계약에 없어 null 은 쿼리에서 제거한다.
 *
 * 요청 시장의 계좌가 없으면 404 NOT_FOUND 다. 빈 목록(200)과 다른 상황이라 뭉개면 안 된다.
 */
export function getJournals(p: {
  market: Market
  cursor?: string | null
  limit?: number
}): Promise<JournalPage> {
  const limit = Math.min(100, Math.max(1, p.limit ?? 20))
  return api.get<JournalPage>('/journal', {
    query: { market: p.market, cursor: p.cursor ?? undefined, limit },
  })
}

/**
 * GET /api/journal/buy/{buyTradeId} — 경로 변수는 체결 ID 다.
 * 매도 체결 ID 를 넣으면 404 가 아니라 400 VALIDATION_ERROR 이고,
 * "체결 없음"과 "회고 미작성"은 **같은 404** 라 code 로 구분할 수 없다.
 */
export function getBuyJournal(buyTradeId: number): Promise<BuyJournalDetail> {
  return api.get<BuyJournalDetail>(`/journal/buy/${buyTradeId}`)
}

/** GET /api/journal/sell/{sellTradeId} — 매수 상세와 완전 대칭이다(오류 의미도 같다). */
export function getSellJournal(sellTradeId: number): Promise<SellJournalDetail> {
  return api.get<SellJournalDetail>(`/journal/sell/${sellTradeId}`)
}

/**
 * 회고 작성(POST 201). 같은 체결에 이미 회고가 있으면 409 DUPLICATE_RESOURCE 다 —
 * 더블 클릭 경합도 같은 409 로 오므로 호출부가 "이미 작성됨 → 수정" 으로 처리해야 한다.
 * content 는 서버가 트림하지 않으므로 호출부가 트림한 값을 넘긴다.
 */
export function createJournal(
  journalType: JournalType,
  tradeId: number,
  req: JournalWriteRequest,
): Promise<BuyJournalCreated | SellJournalCreated> {
  return api.post<BuyJournalCreated | SellJournalCreated>(writePath(journalType, tradeId), req)
}

/**
 * 회고 수정(PATCH 200) — 작성과 같은 경로를 재사용하지만 **upsert 가 아니다.**
 * 회고가 없는 체결에 보내면 404 이고, 그 404 는 "체결 없음"과 구분되지 않으므로
 * 404 를 받고 POST 로 폴백하는 재시도 로직을 짜면 안 된다.
 * 부분 수정이 아니라 본문 교체이며 content 는 필수다. 잠금 조건은 존재하지 않는다
 * (전량 매도된 체결의 회고도 항상 수정 가능 — "매도 후 잠김" UI 를 만들면 안 된다).
 */
export function updateJournal(
  journalType: JournalType,
  tradeId: number,
  req: JournalWriteRequest,
): Promise<BuyJournalDetail | SellJournalDetail> {
  return api.patch<BuyJournalDetail | SellJournalDetail>(writePath(journalType, tradeId), req)
}
