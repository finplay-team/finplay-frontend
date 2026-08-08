// 종목 뉴스·공시 목록과 AI 요약 (FEED-008). 요약 영역과 목록 영역을 별도 상태로 렌더한다
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { formatDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { ensureInstrumentCache, getCachedInstrument } from '../../services/instrumentService'
import { formatOriginDate, getInstrumentNews } from '../../services/feedbackService'
import type {
  FeedbackItemType,
  InstrumentNewsResponse,
  NewsSummaryStatus,
  SummaryScope,
} from '../../services/feedbackTypes'
import type { Market } from '../../services/types'

interface Props {
  instrumentId: number
}

const scopeLabels: Record<SummaryScope, string> = {
  PRE_MARKET: '개장 전 기준',
  FULL: '하루 전체 기준',
  ROLLING_24H: '최근 24시간 기준',
}

const itemTypeLabels: Record<FeedbackItemType, string> = {
  NEWS: '뉴스',
  DISCLOSURE: '공시',
}

/**
 * 요약 영역 문구. **뉴스 목록(Part C) 전용이며 브리핑(Part D)과 절대 공유하지 않는다** —
 * 재생세션 미준비일 때 이쪽은 `NOT_YET`, 브리핑은 `EMPTY` 라 같은 헬퍼로 묶으면 문구가 조용히 틀어진다.
 *
 * `EMPTY` 의 두 원인(기사 0건 / 요약 행 없음)은 응답 필드로 구분되지 않아 `items.length` 로 판별한다.
 */
function summaryCopy(
  status: NewsSummaryStatus,
  originTradeDate: string | null,
  itemCount: number,
  market: Market | undefined,
): string {
  switch (status) {
    case 'NOT_YET':
      // 주식에서만 나온다. originTradeDate 가 null 이면 세션 미준비, 있으면 09:00 이전이다.
      return originTradeDate === null
        ? '장 준비 중입니다. 재생할 거래일이 정해지면 요약이 열립니다.'
        : '개장(09:00) 이후 공개됩니다.'
    case 'EMPTY':
      if (itemCount > 0) return '요약을 준비 중입니다. 아래 목록은 지금 확인할 수 있습니다.'
      return market === 'CRYPTO'
        ? '최근 24시간 동안 확인된 뉴스가 없습니다.'
        : '이 구간에 뉴스·공시가 없습니다.'
    case 'UNAVAILABLE':
      return '지금은 요약을 제공할 수 없습니다. 아래 목록은 그대로 확인할 수 있습니다.'
    case 'READY':
      return ''
  }
}

/** 15:30 에 summaryScope 가 PRE_MARKET→FULL 로 바뀌고 요약 문장도 교체된다. 그 경계에 자동으로 다시 읽는다. */
function msUntilScopeSwitch(): number {
  const now = new Date()
  const boundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 30, 5)
  return boundary.getTime() - now.getTime()
}

export function NewsSummary({ instrumentId }: Props) {
  const [data, setData] = useState<InstrumentNewsResponse | null>(null)
  const [market, setMarket] = useState<Market | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      await ensureInstrumentCache().catch(() => undefined)
      setMarket(getCachedInstrument(instrumentId)?.market)
      setData(await getInstrumentNews(instrumentId))
    } catch (e) {
      setError(toUserMessage(e, { NOT_FOUND: '존재하지 않는 종목입니다.' }))
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  // 요약을 오래 들고 있으면 15:30 이후에도 개장 전 문장을 보여 주게 된다.
  useEffect(() => {
    const delay = msUntilScopeSwitch()
    if (delay <= 0) return
    const id = window.setTimeout(() => void load(), delay)
    return () => window.clearTimeout(id)
  }, [load])

  const copy = data === null ? '' : summaryCopy(data.summaryStatus, data.originTradeDate, data.items.length, market)

  return (
    <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'}>
      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div>
            <Eyebrow>뉴스 요약</Eyebrow>
            <h3 className="mt-2 font-display text-base font-semibold text-ink">
              이 종목에 무슨 소식이 있었나
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {/* NOT_YET 과 동시에 발생하는 summaryScope=null 에서는 배지를 아예 그리지 않는다. */}
            {data?.summaryScope && (
              <span className="rounded-full bg-elevated px-2.5 py-1 text-[10px] text-ink">
                {scopeLabels[data.summaryScope]}
              </span>
            )}
            {data?.originTradeDate && (
              <span className="text-[10px] text-muted">
                {formatOriginDate(data.originTradeDate)} 원본 거래일
              </span>
            )}
          </div>
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
            <div className="skeleton h-16" />
            <div className="skeleton h-24" />
          </div>
        )}

        {data && (
          <>
            {/* 요약 영역 — status 로 분기한다. */}
            <div className="mt-4 rounded-xl bg-elevated p-4">
              {data.summaryStatus === 'READY' && data.summary ? (
                <p className="text-sm leading-relaxed text-ink">{data.summary}</p>
              ) : (
                <p className="text-sm leading-relaxed text-muted">{copy}</p>
              )}
            </div>

            {/*
              목록 영역 — 요약 상태와 **독립**이다.
              EMPTY(요약 행 없음)·UNAVAILABLE 에서도 items 가 채워지므로 status 로 목록을 숨기면 안 된다.
            */}
            {data.items.length > 0 && (
              <ul className="mt-4 space-y-2">
                {/* items 에 id 가 없다. 인덱스를 key 로 쓰면 재조회 때 섞이므로 url+발행시각을 쓴다. */}
                {/*
                  서버가 항목 id 를 주지 않는다. url+publishedAt 은 유일해 보이지만 같은 기사가
                  여러 종목에 태그되면 그대로 겹친다(브리핑에서 실제로 중복 key 경고가 났다).
                  목록이 재정렬되지 않으므로 인덱스를 섞어도 안전하다.
                */}
                {data.items.map((item, i) => (
                  <li
                    key={`${i}-${item.url}`}
                    className="rounded-xl border border-line p-3"
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm leading-relaxed text-ink underline decoration-line underline-offset-2 hover:decoration-brand"
                    >
                      {item.title}
                    </a>
                    <p className="mt-1.5 text-[10px] text-muted">
                      {itemTypeLabels[item.type]} · {item.publisher} · {formatDateTime(item.publishedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {/* 공시는 발행시각이 00:00:00 이라 내림차순 최하위다. 아래쪽에 몰리는 것이 정상이므로 재정렬하지 않는다. */}
            {data.items.some((i) => i.type === 'DISCLOSURE') && (
              <p className="mt-3 text-[10px] leading-relaxed text-muted">
                공시는 접수일자만 제공되어 목록 아래쪽에 모입니다.
              </p>
            )}

            <Button type="button" size="sm" variant="ghost" className="mt-4" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
