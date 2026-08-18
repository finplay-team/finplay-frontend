// 종목의 변동 원인 카드 목록 (FEED-006). 넷 중 유일하게 status enum 이 없어 originTradeDate+market 으로 상태를 추론한다
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { formatDateTime, formatHhMm } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { pnlTone } from '../../lib/format'
import { ensureInstrumentCache, getCachedInstrument } from '../../services/instrumentService'
import { formatOriginDate, formatRatePercent, getPriceMoves } from '../../services/feedbackService'
import type { FeedbackSource, PriceMoveListResponse } from '../../services/feedbackTypes'
import type { Market } from '../../services/types'

interface Props {
  instrumentId: number
}

/**
 * 응답에 상태 필드가 없어 클라이언트가 만들어 쓰는 표시 상태다.
 * `originTradeDate=null` 하나로는 "재생세션 미준비"와 "코인"을 가를 수 없어 `market` 이 판정에 들어간다.
 */
type MoveView =
  | 'CARDS' // 카드 있음 (주식·코인 공통)
  | 'STOCK_NO_CARDS_YET' // 주식, 세션 준비됨, 아직 열린 카드 없음
  | 'STOCK_SESSION_NOT_READY' // 주식, 재생세션 미준비
  | 'CRYPTO_NO_CARDS' // 코인, 최근 24시간 카드 0건
  | 'UNKNOWN_EMPTY' // 종목 캐시가 아직 없어 시장을 모른 채 비어 있음

function resolveView(data: PriceMoveListResponse, market: Market | undefined): MoveView {
  if (data.moves.length > 0) return 'CARDS'
  if (market === 'CRYPTO') return 'CRYPTO_NO_CARDS'
  if (market === 'STOCK') {
    return data.originTradeDate === null ? 'STOCK_SESSION_NOT_READY' : 'STOCK_NO_CARDS_YET'
  }
  // 캐시 미로드 등으로 시장을 확정할 수 없을 때. 원인을 단정하지 않는 문구를 쓴다.
  return data.originTradeDate === null ? 'UNKNOWN_EMPTY' : 'STOCK_NO_CARDS_YET'
}

/** 상태 → 문구. price-moves 전용이며 뉴스·브리핑과 공유하지 않는다(같은 상황의 상태값이 서로 다르다). */
const emptyCopy: Record<Exclude<MoveView, 'CARDS'>, { title: string; body: string }> = {
  STOCK_NO_CARDS_YET: {
    title: '아직 공개된 변동 원인이 없습니다',
    body: '장이 진행되면 그 시각에 해당하는 카드부터 순서대로 열립니다.',
  },
  STOCK_SESSION_NOT_READY: {
    title: '장 준비 중입니다',
    body: '재생할 거래일이 정해지면 그날의 변동 원인 카드가 열립니다.',
  },
  CRYPTO_NO_CARDS: {
    title: '최근 24시간 변동 원인 카드가 없습니다',
    body: '근거 기사가 확인된 변동만 카드로 만들어집니다.',
  },
  UNKNOWN_EMPTY: {
    title: '표시할 변동 원인 카드가 없습니다',
    body: '잠시 후 다시 불러와 주세요.',
  },
}

const sourceTypeLabels: Record<FeedbackSource['type'], string> = {
  NEWS: '뉴스',
  DISCLOSURE: '공시',
}

/**
 * 카드 근거 목록. post-sell 안의 카드도 같은 5필드 구조라 그쪽에서 재사용한다.
 * `publisher` 는 한글 언론사명이 아니라 도메인이며 그대로 노출하는 것이 현재 계약이다.
 */
export function SourceList({ sources }: { sources: FeedbackSource[] }) {
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
      {sources.map((s) => (
        // items 와 달리 sources 에는 id 가 없지는 않지만 응답에 실리지 않는다 — url 을 key 로 쓴다.
        <li key={`${s.url}-${s.publishedAt}`} className="text-xs leading-relaxed">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink underline decoration-line underline-offset-2 hover:decoration-brand"
          >
            {s.title}
          </a>
          <span className="ml-2 text-[10px] text-muted">
            {sourceTypeLabels[s.type]} · {s.publisher} · {formatDateTime(s.publishedAt)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PriceMoveCards({ instrumentId }: Props) {
  const [data, setData] = useState<PriceMoveListResponse | null>(null)
  const [market, setMarket] = useState<Market | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      // 종목 캐시는 영구 캐시라 두 번째 호출부터 네트워크가 나가지 않는다.
      // 캐시가 실패해도 카드 자체는 보여 줄 수 있으므로 실패를 삼킨다.
      await ensureInstrumentCache().catch(() => undefined)
      setMarket(getCachedInstrument(instrumentId)?.market)
      setData(await getPriceMoves(instrumentId))
    } catch (e) {
      setError(toUserMessage(e, { NOT_FOUND: '존재하지 않는 종목입니다.' }))
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  const view = data === null ? null : resolveView(data, market)

  return (
    // 주식은 민트 대신 모의투자 화면 전용 파란 액센트를 쓴다(2026-08-18 피드백).
    <Card accent={market === 'CRYPTO' ? 'coin' : 'blue'}>
      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div>
            <Eyebrow dotClassName={market === 'CRYPTO' ? 'bg-coin' : 'bg-[#2FA4E7]'}>변동 원인</Eyebrow>
            <h3 className="mt-2 font-display text-base font-semibold text-ink">
              가격이 움직인 구간
            </h3>
          </div>
          {/* 코인은 originTradeDate 가 항상 null 이고 롤링 24시간이라 날짜 라벨 자체가 없다. */}
          <span className="text-[10px] text-muted">
            {market === 'CRYPTO'
              ? '최근 24시간 기준'
              : data?.originTradeDate
                ? `${formatOriginDate(data.originTradeDate)} 원본 거래일 기준`
                : ''}
          </span>
        </div>

        {error && (
          <div className="mt-4">
            <p className="text-sm text-rose-300">{error}</p>
            <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </div>
        )}

        {data === null && !error && (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        )}

        {view !== null && view !== 'CARDS' && (
          <div className="mt-4 rounded-xl bg-elevated p-4">
            <p className="text-sm font-semibold text-ink">{emptyCopy[view].title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{emptyCopy[view].body}</p>
            <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </div>
        )}

        {view === 'CARDS' && data && (
          <ul className="mt-4 space-y-3">
            {/* 정렬(windowStart 오름차순 + id 오름차순)은 서버가 보장한다. 재정렬하지 않는다. */}
            {data.moves.map((move) => (
              <li key={move.id} className="rounded-xl bg-elevated p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-xs text-muted">
                    {/* 원본 거래일 축의 시각이라 날짜를 크게 쓰지 않고 시각만 보여 준다. */}
                    {formatHhMm(move.windowStart)}–{formatHhMm(move.windowEnd)}
                    {move.eventType === 'OPENING_GAP' && (
                      <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink">
                        시가 갭
                      </span>
                    )}
                  </span>
                  <span className={`tabular text-sm font-semibold ${pnlTone(move.changeRate)}`}>
                    {formatRatePercent(move.changeRate)}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-ink">{move.narrative}</p>

                {/* 근거 없는 카드는 생성되지 않으므로 sources 는 항상 1건 이상이다. */}
                <SourceList sources={move.sources} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
