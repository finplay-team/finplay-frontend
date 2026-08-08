// AI 피드백(FEED-006~011) 조회 서비스. 네 경로 모두 인증 필수·bare JSON·성공은 전부 200 이다
import { api } from '../lib/apiClient'
import { ratioToPercent } from '../lib/datetime'
import type { Decimal, LocalDateString, Market } from './types'
import type {
  InstrumentNewsResponse,
  MarketBriefingResponse,
  PostSellFeedbackResponse,
  PriceMoveListResponse,
} from './feedbackTypes'

/**
 * 종목의 변동 원인 카드. 쿼리·페이지네이션이 없다.
 *
 * **status enum 이 없는 유일한 경로다.** 빈 상태 판정은 `originTradeDate` + `moves.length` 조합뿐이고,
 * `originTradeDate=null` 은 "재생세션 미준비(주식)"와 "코인" 둘 다를 뜻한다 —
 * 호출부가 `instrumentService` 캐시에서 `market` 을 먼저 확인해야 문구를 고를 수 있다.
 *
 * `moves=[]` 는 오류가 아니라 정상 200 이다(오전이라 아직 열린 카드가 없는 경우가 흔하다).
 * 정렬은 `windowStart` 오름차순 + 동률 `id` 오름차순으로 서버가 보장하므로 재정렬하지 않는다.
 */
export function getPriceMoves(
  instrumentId: number,
  p?: { signal?: AbortSignal },
): Promise<PriceMoveListResponse> {
  return api.get<PriceMoveListResponse>(`/instruments/${instrumentId}/price-moves`, {
    signal: p?.signal,
  })
}

/**
 * 본인 매도 체결 1건의 매도 직후 피드백. 조회 대상 회원은 Access Token 의 본인으로 고정된다.
 *
 * **2차는 주식 전용이다.** 코인 체결(`market=CRYPTO`)도 매수 체결(`side=BUY`)도 400 `VALIDATION_ERROR` 이며
 * **두 경우의 code 가 같아 원인을 구분할 수 없다.** 진입점을 `market`·`side` 로 가드하는 것이 정석이고,
 * 그래도 도달했을 때를 대비해 화면이 설명 가능한 빈 상태를 그려야 한다.
 *
 * 응답의 `narrative` 는 재생성 로직이 있어 **같은 tradeId 를 다시 조회해도 문장이 바뀔 수 있다.**
 * 로컬에 영구 캐시하지 않는다.
 */
export function getPostSellFeedback(
  tradeId: number,
  p?: { signal?: AbortSignal },
): Promise<PostSellFeedbackResponse> {
  return api.get<PostSellFeedbackResponse>(`/ai/post-sell/${tradeId}`, { signal: p?.signal })
}

/**
 * 종목 뉴스·공시 목록과 AI 요약. 조회 시 생성하지 않는다(GET 부수효과 없음).
 *
 * **`summaryStatus !== 'READY'` 라고 목록을 숨기면 안 된다** — 요약 행이 없어서 나는 `EMPTY` 와
 * `UNAVAILABLE` 에서도 `items` 는 채워진다. 요약 영역과 목록 영역을 따로 렌더한다.
 *
 * `summaryScope` 는 15:30 에 `PRE_MARKET`→`FULL` 로 바뀌고 `summary` 문장도 교체된다. 장기 캐시 금지.
 * 상한 초과 시 서버가 공시를 먼저 확보하고 남은 자리를 뉴스로 채우므로 **공시가 목록 아래쪽에 몰리는 것이 정상이다.**
 */
export function getInstrumentNews(
  instrumentId: number,
  p?: { signal?: AbortSignal },
): Promise<InstrumentNewsResponse> {
  return api.get<InstrumentNewsResponse>(`/instruments/${instrumentId}/news`, { signal: p?.signal })
}

/**
 * 시장 단위 개장 전 브리핑. `market` 은 **필수**이며 `STOCK`·`CRYPTO` 리터럴만 허용된다(누락·오타 모두 400).
 *
 * 상태 필드 이름이 `summaryStatus` 가 아니라 **`status`** 이고, 재생세션 미준비일 때 값이
 * 뉴스 목록의 `NOT_YET` 과 달리 **`EMPTY`** 다. spec 이 "의도된 차이"라고 못 박았으므로
 * 뉴스 목록과 상태 해석 헬퍼를 공유하지 않는다.
 */
export function getMarketBriefing(
  market: Market,
  p?: { signal?: AbortSignal },
): Promise<MarketBriefingResponse> {
  return api.get<MarketBriefingResponse>('/market/briefing', {
    query: { market },
    signal: p?.signal,
  })
}

/* ---------- 이 도메인 전용 표시 헬퍼 ---------- */
/*
 * lib/format.ts 의 formatPercent 는 toFixed(1) 고정이라 scale-4 비율의 둘째 자리를 버린다
 * (-0.0182 → "−1.8%"). 그런데 서버 narrative 는 같은 값을 "1.82% 하락"이라고 적으므로
 * 문장과 배지가 서로 다른 숫자를 말하게 된다. format.ts 를 고치면 다른 화면의 표기가 함께 바뀌므로
 * 이 도메인에서만 쓰는 자리수 지정 포매터를 둔다. 네 컴포넌트가 모두 쓰기 때문에 서비스 모듈에 모았다.
 */

/** 부호 있는 비율 표시. 입력은 **비율**이며 ×100 은 ratioToPercent 한 곳에서만 한다. */
export function formatRatePercent(ratio: Decimal, digits = 2): string {
  const percent = ratioToPercent(ratio)
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : ''
  return `${sign}${Math.abs(percent).toFixed(digits)}%`
}

/** 부호 없는 비중 표시(예: soldWithin30MinRate 0.38 → "38%"). 손익이 아니라 점유율이라 부호를 붙이지 않는다. */
export function formatSharePercent(ratio: Decimal, digits = 0): string {
  return `${ratioToPercent(ratio).toFixed(digits)}%`
}

/** LocalDate "2026-07-29" → "7월 29일". 원본 거래일 라벨용이라 연도는 생략한다. */
export function formatOriginDate(value: LocalDateString): string {
  const [, month, day] = value.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

/** 분 단위 서버 값을 사람이 읽는 길이로. **클라이언트가 시각 차이를 직접 계산하지 않는다**(서버는 분으로 내린 뒤 뺀다). */
export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes < 0 ? '−' : ''
  if (h === 0) return `${sign}${m}분`
  return m === 0 ? `${sign}${h}시간` : `${sign}${h}시간 ${m}분`
}
