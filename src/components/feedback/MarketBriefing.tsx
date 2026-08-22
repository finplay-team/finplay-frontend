// 시장 단위 개장 전 브리핑 (FEED-009). 상태 필드 이름이 status 이고 뉴스 목록과 상태값 의미가 다르다
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { formatDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatOriginDate, getMarketBriefing } from '../../services/feedbackService'
import type {
  BriefingStatus,
  FeedbackItemType,
  MarketBriefingResponse,
} from '../../services/feedbackTypes'
import type { Market } from '../../services/types'

interface Props {
  market: Market
}

const itemTypeLabels: Record<FeedbackItemType, string> = {
  NEWS: '뉴스',
  DISCLOSURE: '공시',
}

/**
 * 요약 영역 문구. **브리핑 전용이며 뉴스 목록(Part C)과 공유하지 않는다** —
 * 재생세션 미준비가 여기서는 `EMPTY`(+ `originTradeDate=null`), 뉴스 목록에서는 `NOT_YET` 이다.
 * spec 이 "의도된 차이"라고 못 박은 지점이라 공통 헬퍼로 묶으면 버그가 된다.
 *
 * 코인은 `status` 가 `NOT_YET` 이 되지 않고 재생세션과 무관하게 `originTradeDate` 가 항상 `null` 이므로,
 * 코인에서 `EMPTY` + 날짜 없음을 "장 준비 중"으로 읽으면 오판이다.
 */
function summaryCopy(
  status: BriefingStatus,
  originTradeDate: string | null,
  itemCount: number,
  market: Market,
): string {
  switch (status) {
    case 'NOT_YET':
      // 주식만. 세션은 준비됐고 09:00 이전이라 originTradeDate 는 채워져 있다.
      return '개장 시각(09:00)에 공개됩니다.'
    case 'EMPTY':
      if (itemCount > 0) return '브리핑 요약을 준비 중입니다. 아래 목록은 지금 확인할 수 있습니다.'
      if (market === 'CRYPTO') return '최근 24시간 동안 확인된 소식이 없습니다.'
      return originTradeDate === null
        ? '장 준비 중입니다. 재생할 거래일이 정해지면 브리핑이 열립니다.'
        : '개장 전 확인된 소식이 없습니다.'
    case 'UNAVAILABLE':
      return '지금은 요약을 제공할 수 없습니다. 아래 목록은 그대로 확인할 수 있습니다.'
    case 'READY':
      return ''
  }
}

export function MarketBriefing({ market }: Props) {
  const [data, setData] = useState<MarketBriefingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 목록을 5개로 접어 두는 기본값. "전체보기"를 누르면 펼친다 — 서버가 이미 받아온 목록이라
   *  추가 요청 없이 그대로 더 보여주면 된다(2026-08-22 피드백). */
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setExpanded(false)
    try {
      setData(await getMarketBriefing(market))
    } catch (e) {
      setError(toUserMessage(e))
    }
  }, [market])

  useEffect(() => {
    void load()
  }, [load])

  const copy = data === null ? '' : summaryCopy(data.status, data.originTradeDate, data.items.length, market)
  const visibleItems = data === null ? [] : expanded ? data.items : data.items.slice(0, 5)

  return (
    <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'}>
      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div>
            <Eyebrow>{market === 'CRYPTO' ? '코인 브리핑' : '개장 전 브리핑'}</Eyebrow>
            <h3 className="mt-2 font-display text-base font-semibold text-ink">
              오늘 시장에서 확인된 소식
            </h3>
          </div>
          {/* 전체보기는 이 기준 문구 바로 밑, 오른쪽 정렬로 둔다 — 다시 불러오기는 카드 하단
              원래 자리 그대로다(2026-08-22 피드백). */}
          <div className="flex flex-col items-end gap-2">
            <span className="text-[10px] text-muted">
              {market === 'CRYPTO'
                ? '최근 24시간 기준'
                : data?.originTradeDate
                  ? `${formatOriginDate(data.originTradeDate)} 원본 거래일 기준`
                  : ''}
            </span>
            {/* 이미 받아온 목록이라 추가 요청 없이 그대로 펼친다 — API 재조회가 필요한 "더 불러오기"와 다르다. */}
            {data && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '접기' : `전체보기 (${data.items.length})`}
              </Button>
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
            <div className="mt-4 rounded-xl bg-elevated p-4">
              {data.status === 'READY' && data.summary ? (
                <p className="text-sm leading-relaxed text-ink">{data.summary}</p>
              ) : (
                <p className="text-sm leading-relaxed text-muted">{copy}</p>
              )}
            </div>

            {/* 목록은 요약 상태와 독립이다. EMPTY(브리핑 행 없음)·UNAVAILABLE 에서도 items 가 채워진다.
                한 화면에 너무 많이 쌓이면 어지러워 최대 5개만 보여준다(2026-08-22 피드백). */}
            {data.items.length > 0 && (
              <ul className="mt-4 space-y-2">
                {/* items 에 id 가 없다. url + 발행시각을 key 로 쓴다. */}
                {/*
                  서버가 항목 id 를 주지 않는다. url+publishedAt 은 유일해 보이지만 같은 기사가
                  여러 종목에 태그되면 그대로 겹친다(브리핑에서 실제로 중복 key 경고가 났다).
                  목록이 재정렬되지 않으므로 인덱스를 섞어도 안전하다.
                */}
                {visibleItems.map((item, i) => (
                  <li
                    key={`${i}-${item.url}`}
                    className="rounded-xl border border-line p-3"
                  >
                    {/* 종목 정보가 아이템에 실려 오는 것은 브리핑뿐이다 — 추가 조회 없이 이름을 붙인다. */}
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold text-ink">{item.name}</span>
                      <span className="text-[10px] text-muted">{item.symbol}</span>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 block text-sm leading-relaxed text-ink underline decoration-line underline-offset-2 hover:decoration-brand"
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

            {/*
              전 종목 합산 단일 목록이라 상한 절단이 가장 세게 걸리는 자리다.
              서버가 공시를 먼저 확보한 뒤 뉴스를 채우므로 공시가 아래쪽에 몰린다 — 재정렬하지 않는다.
              화면에 보이는 항목 기준으로만 안내한다 — 접혀서 안 보이는 공시 때문에 문구가 뜨면 안 된다.
            */}
            {visibleItems.some((i) => i.type === 'DISCLOSURE') && (
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
