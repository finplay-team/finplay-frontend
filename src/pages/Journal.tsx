// 시장(주식/코인)별 투자일기 목록을 커서 페이징으로 보여주고 인라인 수정까지 처리하는 화면
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { JournalEditor, type JournalSaved } from '../components/journal/JournalEditor'
import { parseLocalDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { sideLabels } from '../lib/labels'
import { getJournals } from '../services/journalService'
import type { JournalListItem, LocalDateTimeString, Market } from '../services/types'

const PAGE_SIZE = 20

/**
 * 목록 항목의 유일 키. 통합 journalId 가 응답에 없고, journalId 자체도 매수·매도 시퀀스가 별개라
 * 전역 유일하지 않다. 반드시 타입 + 해당 타입의 체결 ID 를 조합해야 한다.
 */
function itemKey(item: JournalListItem): string {
  return `${item.journalType}-${item.buyTradeId ?? item.sellTradeId}`
}

/** 항목이 가리키는 체결 ID — 둘 중 하나는 항상 null 이라 journalType 으로 먼저 분기한다. */
function tradeIdOf(item: JournalListItem): number | null {
  return item.journalType === 'BUY' ? item.buyTradeId : item.sellTradeId
}

/**
 * lib/datetime 의 formatDateTime 은 연도를 표시하지 않는다.
 * 투자일기는 과거 여러 해에 걸칠 수 있어 목록에서 "1월 3일"만 보면 어느 해인지 알 수 없다.
 */
function formatDateTimeWithYear(value: LocalDateTimeString): string {
  const d = parseLocalDateTime(value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}

export function Journal() {
  const [market, setMarket] = useState<Market>('STOCK')
  const [reloadKey, setReloadKey] = useState(0)

  const [items, setItems] = useState<JournalListItem[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [editingKey, setEditingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setLoadError(null)
    setEditingKey(null)
    getJournals({ market, limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setItems(page.content)
        setNextCursor(page.nextCursor)
        setHasNext(page.hasNext)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // 계좌 없음(404)은 "빈 목록"이 아니다. 빈 상태 UI 로 뭉개면 계좌 문제를 놓친다.
        setLoadError(
          toUserMessage(e, {
            NOT_FOUND: '이 시장의 계좌를 찾을 수 없습니다.',
            VALIDATION_ERROR: '일기 목록을 불러올 수 없습니다.',
          }),
        )
      })
    return () => {
      cancelled = true
    }
  }, [market, reloadKey])

  /** 마지막 페이지 판정은 hasNext 가 정본이다. content.length < limit 으로 판정하면 안 된다. */
  const loadMore = useCallback(async () => {
    if (!hasNext || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      // 커서는 조립하지 않고 직전 응답의 nextCursor 를 그대로 되돌려 보낸다.
      const page = await getJournals({ market, cursor: nextCursor, limit: PAGE_SIZE })
      setItems((prev) => [...(prev ?? []), ...page.content])
      setNextCursor(page.nextCursor)
      setHasNext(page.hasNext)
    } catch (e) {
      setLoadError(toUserMessage(e, { NOT_FOUND: '이 시장의 계좌를 찾을 수 없습니다.' }))
    } finally {
      setLoadingMore(false)
    }
  }, [hasNext, loadingMore, market, nextCursor])

  /**
   * 목록 정렬은 createdAt 기준이라 방금 고친 항목이 맨 위로 오지 않는다.
   * 재조회하면 사용자가 방금 고친 항목이 화면 밖으로 밀릴 수 있어 해당 항목만 로컬 갱신한다.
   */
  const applySaved = useCallback((key: string, saved: JournalSaved) => {
    setItems((prev) =>
      (prev ?? []).map((item) =>
        itemKey(item) === key
          ? { ...item, content: saved.content, updatedAt: saved.updatedAt }
          : item,
      ),
    )
    setEditingKey(null)
  }, [])

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -left-24 top-16 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>투자일기</Eyebrow>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
              그때 왜 그렇게 판단했나
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              체결마다 남긴 회고를 최신순으로 모아 봅니다.
            </p>
          </div>
          <MarketTabs market={market} onChange={setMarket} />
        </header>

        <section className="mt-8 space-y-4">
          {items === null && !loadError &&
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} innerClassName="p-6">
                <div className="skeleton h-3 w-24" />
                <div className="mt-4 skeleton h-3 w-full" />
                <div className="mt-2 skeleton h-3 w-4/5" />
                <div className="mt-5 skeleton h-2.5 w-40" />
              </Card>
            ))}

          {loadError && (
            <Card innerClassName="p-8 text-center">
              <p className="text-sm text-ink">{loadError}</p>
              <div className="mt-5 flex justify-center">
                <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
                  다시 시도
                </Button>
              </div>
            </Card>
          )}

          {!loadError && items !== null && items.length === 0 && (
            <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="px-6 py-16 text-center">
              <p className="font-display text-lg font-semibold text-ink">아직 투자일기가 없습니다</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                포트폴리오의 체결 내역에서 매수·매도 회고를 남기면 여기에 모입니다.
              </p>
            </Card>
          )}

          {!loadError &&
            items?.map((item) => {
              const key = itemKey(item)
              const tradeId = tradeIdOf(item)
              const editing = editingKey === key
              // updatedAt === createdAt 이면 미수정이다(별도 isEdited 플래그가 없다).
              const edited = item.updatedAt !== item.createdAt
              return (
                <Card key={key} innerClassName="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        item.journalType === 'BUY' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {sideLabels[item.journalType]}
                    </span>
                    {edited && (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                        수정됨
                      </span>
                    )}
                  </div>

                  {editing && tradeId !== null ? (
                    <div className="mt-4">
                      <JournalEditor
                        journalType={item.journalType}
                        tradeId={tradeId}
                        mode="update"
                        initialContent={item.content}
                        onSaved={(saved) => applySaved(key, saved)}
                        onCancel={() => setEditingKey(null)}
                      />
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                        {item.content}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <p className="text-xs text-muted tabular">
                          {formatDateTimeWithYear(item.createdAt)} 작성
                          {edited && (
                            <>
                              <span className="px-2 text-muted/50">·</span>
                              {formatDateTimeWithYear(item.updatedAt)} 수정
                            </>
                          )}
                        </p>
                        {/* 잠금 규칙이 없어 전량 매도된 체결의 일기도 항상 수정할 수 있다. */}
                        {tradeId !== null && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingKey(key)}
                          >
                            수정
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              )
            })}
        </section>

        {!loadError && hasNext && (
          <div className="mt-8 flex justify-center">
            <Button variant="ghost" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
