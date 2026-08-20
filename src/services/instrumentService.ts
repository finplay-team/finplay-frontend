// 종목 목록·시세·분봉 조회 서비스. 주문·거래 응답에 symbol·name 이 없어 모듈 스코프 캐시 조인이 필수다
import { api } from '../lib/apiClient'
import type { Candle, CandleInterval, Instrument, Market, PriceResponse } from './types'

export interface InstrumentIndex {
  byId: Map<number, Instrument>
  bySymbol: Map<string, Instrument>
}

// 종목은 Flyway 시드라 런타임에 변하지 않는다 → TTL·재검증 없는 영구 캐시가 맞다.
let cache: InstrumentIndex | null = null
let inFlight: Promise<InstrumentIndex> | null = null

export function loadInstruments(market?: Market): Promise<Instrument[]> {
  return api.get<Instrument[]>('/instruments', { query: { market } })
}

/** 전체 종목을 1회만 로드해 캐시한다. 동시 마운트된 컴포넌트가 여러 개여도 요청은 한 번만 나간다. */
export function ensureInstrumentCache(): Promise<InstrumentIndex> {
  if (cache) return Promise.resolve(cache)
  if (inFlight) return inFlight

  inFlight = loadInstruments()
    .then((list) => {
      const index: InstrumentIndex = {
        byId: new Map(list.map((i) => [i.instrumentId, i])),
        bySymbol: new Map(list.map((i) => [i.symbol, i])),
      }
      cache = index
      return index
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** 목록 렌더에서 쓰는 동기 조회. 캐시가 아직 없으면 undefined 다. */
export function getCachedInstrument(instrumentId: number): Instrument | undefined {
  return cache?.byId.get(instrumentId)
}

export function getCachedBySymbol(symbol: string): Instrument | undefined {
  return cache?.bySymbol.get(symbol)
}

export function invalidateInstrumentCache(): void {
  cache = null
}

/** 시세가 없으면 200 이 아니라 409 PRICE_UNAVAILABLE 로 온다. */
export function getPrice(instrumentId: number): Promise<PriceResponse> {
  return api.get<PriceResponse>(`/instruments/${instrumentId}/price`)
}

/** 캔들 응답이 과거 방향 커서 페이지네이션 봉투로 바뀐 뒤의 형태(finplay-backend #473). */
interface CandlePageResponse {
  content: Candle[]
  nextCursor: string | null
  hasNext: boolean
}

function isCandlePageResponse(data: Candle[] | CandlePageResponse): data is CandlePageResponse {
  return !Array.isArray(data)
}

/**
 * 캔들 조회. `interval` 은 **대소문자를 구분하는 4값**이며 `1m`(분)과 `1M`(월)이 다르다.
 * 200 [] 은 오류가 아니라 정상 응답이다(재생세션 미준비, 09:01 이전 등).
 *
 * 응답은 어떤 interval 이든 최대 200개다. 주식 `1m` 은 미마감 분봉을 제외하지만
 * 집계(`1d`·`1w`·`1M`)는 진행 중 버킷을 포함한다 — 정반대이므로 화면 문구를 하나로 쓰면 안 된다.
 *
 * **과도기 호환(finplay-backend #473·#496)**: 백엔드가 응답을 맨 배열에서
 * `{ content, nextCursor, hasNext }` 봉투로 바꾸는 배포 중이다. 두 형태를 모두 받아 항상
 * `Candle[]`로 풀어 돌려준다 — 호출부(`useCandles.loadOlder` 등)는 이 함수 하나만 거치므로
 * 바뀔 일이 없다. 백엔드 배포가 안정화되면(#496) 이 함수를 봉투 전용으로 좁히고 이 폴백을 지운다.
 */
export function getCandles(
  instrumentId: number,
  p?: { interval?: CandleInterval; from?: string; to?: string; signal?: AbortSignal },
): Promise<Candle[]> {
  return api
    .get<Candle[] | CandlePageResponse>(`/instruments/${instrumentId}/candles`, {
      query: { interval: p?.interval ?? '1m', from: p?.from, to: p?.to },
      signal: p?.signal,
    })
    .then((data) => (isCandlePageResponse(data) ? data.content : data))
}
