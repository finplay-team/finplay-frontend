// 시장별 실현손익 상위 랭킹과 내 순위를 보여주는 페이지 (RANK-001·002)
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { toUserMessage } from '../lib/errorMessages'
import { formatKRW, pnlTone } from '../lib/format'
import { getMyRanking, getRankings } from '../services/rankingService'
import type { Market, MyRanking, RankingList } from '../services/types'

/** 서버 기본값과 상한이다. 클라이언트가 클램프하지 않고 이 두 값만 요청한다(51 이상은 어차피 50으로 조용히 줄어든다). */
const TOP_LIMIT = 10
const EXPANDED_LIMIT = 50

const errorOverrides = {
  VALIDATION_ERROR: '시장 값이 올바르지 않아 랭킹을 불러오지 못했습니다.',
  INTERNAL_ERROR: '랭킹 집계 서버에 문제가 있어 순위를 불러오지 못했습니다.',
}

/** 부호를 붙인 정확한 원화 금액. formatPnl 은 만 단위로 축약해 동점 판별이 필요한 랭킹 표에 쓸 수 없다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

export function Rankings() {
  const [market, setMarket] = useState<Market>('STOCK')
  const [limit, setLimit] = useState(TOP_LIMIT)
  const [reloadKey, setReloadKey] = useState(0)

  const [list, setList] = useState<RankingList | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [me, setMe] = useState<MyRanking | null>(null)
  const [meError, setMeError] = useState<string | null>(null)

  // 두 엔드포인트를 따로 읽는다. Redis 장애는 500 이고 폴백이 없으므로 한쪽 실패가 다른 쪽 화면까지
  // 지우면 안 된다(랭킹 목록이 죽어도 내 순위 카드는 살아 있을 수 있다).
  useEffect(() => {
    let cancelled = false
    setList(null)
    setListError(null)
    getRankings({ market, limit })
      .then((res) => {
        if (!cancelled) setList(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setListError(toUserMessage(e, errorOverrides))
      })
    return () => {
      cancelled = true
    }
  }, [market, limit, reloadKey])

  useEffect(() => {
    let cancelled = false
    setMe(null)
    setMeError(null)
    getMyRanking(market)
      .then((res) => {
        if (!cancelled) setMe(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setMeError(toUserMessage(e, errorOverrides))
      })
    return () => {
      cancelled = true
    }
  }, [market, reloadKey])

  const isCrypto = market === 'CRYPTO'
  const accent = isCrypto ? 'coin' : 'brand'
  // 요청 limit 이 아니라 실제로 받은 개수를 쓴다. 서버가 조용히 클램핑하므로 두 값이 다를 수 있다.
  const shownCount = list?.content.length ?? 0
  const listEmpty = list !== null && shownCount === 0
  // 닉네임이 같은 행이 실제로 있었는지 — 하이라이트 각주를 그때만 붙인다.
  const highlighted = me !== null && list !== null && list.content.some((e) => e.nickname === me.nickname)

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 left-1/4 h-72 w-72 animate-float-orb" aria-hidden />

      <div className="relative mx-auto max-w-3xl">
        {/* 1. 헤더 — market 은 필수 파라미터라 탭 없이 조회할 수 없다. */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>랭킹</Eyebrow>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
              {isCrypto ? '코인 실현손익 랭킹' : '주식 실현손익 랭킹'}
            </h1>
            <MarketTabs
              market={market}
              onChange={(next) => {
                setMarket(next)
                setLimit(TOP_LIMIT)
              }}
              className="mt-5"
            />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              매도로 확정된 손익만 집계합니다. 아직 팔지 않은 종목의 평가손익은 순위에 들어가지 않습니다.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
            새로고침
          </Button>
        </header>

        {/* 2. 내 랭킹 — 목록과 응답 구조가 달라(flat) 따로 호출한 결과다. */}
        <Card className="mt-8" accent={accent} innerClassName="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-ink">내 랭킹</h2>

          {meError && <p className="mt-4 text-sm text-loss">{meError}</p>}

          {!meError && me === null && (
            <div className="mt-5 space-y-2">
              <div className="skeleton h-8 w-40" />
              <div className="skeleton h-4 w-56" />
            </div>
          )}

          {!meError && me !== null && (
            <>
              <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <p className="text-xs text-muted">순위</p>
                  {/* rank 만 null 이 될 수 있다. 0 은 존재하지 않지만 명시 비교가 안전하다. */}
                  <p className="mt-1 font-display text-3xl font-semibold tabular text-ink">
                    {me.rank === null ? '—' : `${me.rank.toLocaleString('ko-KR')}위`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">닉네임</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{me.nickname}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">실현손익</p>
                  <p className={`mt-1 text-lg font-semibold tabular ${pnlTone(me.realizedPnl)}`}>
                    {signedKRW(me.realizedPnl)}
                  </p>
                </div>
              </div>

              {/*
                rank === null 은 "응답이 비었다"가 아니다. 닉네임·실현손익 0 은 정상 값이므로 위에 그대로 두고
                순위가 없는 이유만 덧붙인다. ZSET 유실 시에도 같은 화면이 나오므로 단정하지 않는다.
              */}
              {me.rank === null && (
                <p className="mt-5 text-sm leading-relaxed text-muted">
                  매도 체결이 있어야 순위가 잡힙니다. 아직 판 종목이 없어 집계 대상에 들어가지 않았습니다.
                  매도한 적이 있는데도 이 안내가 보인다면 랭킹 집계 데이터 문제일 수 있으니 잠시 후 다시
                  확인해 주세요.
                </p>
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-muted">
                이 실현손익은 랭킹 집계 기준 값이라 포트폴리오 화면의 계좌 실현손익과 잠시 다를 수 있습니다.
              </p>
            </>
          )}
        </Card>

        {/* 3. 상위 랭킹 목록 */}
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-ink">상위 랭킹</h2>
            {list !== null && (
              <span className="text-xs text-muted tabular">{shownCount}명 표시 중</span>
            )}
          </div>

          {listError && (
            <Card className="mt-5" innerClassName="p-8 text-center">
              <p className="text-sm text-ink">{listError}</p>
              <div className="mt-5 flex justify-center">
                <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
                  다시 시도
                </Button>
              </div>
            </Card>
          )}

          {!listError && list === null && (
            <Card className="mt-5" innerClassName="p-6">
              <div className="space-y-2">
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
              </div>
            </Card>
          )}

          {/*
            빈 목록은 오류가 아니다. 다만 "아직 아무도 안 팔았다"와 "집계 데이터가 비었다"가 응답상
            구별되지 않으므로(백엔드 R-0) 사용자가 꼴찌라는 뜻으로 읽히지 않게 적는다.
          */}
          {!listError && listEmpty && (
            <Card className="mt-5" innerClassName="px-6 py-14 text-center">
              <p className="font-display text-lg font-semibold text-ink">
                아직 매도 기록을 남긴 사용자가 없습니다
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                순위가 비어 있을 뿐 누가 뒤처졌다는 뜻이 아닙니다. 집계 데이터가 아직 준비되지 않아
                비어 보일 수도 있으니 잠시 후 다시 확인해 주세요.
              </p>
            </Card>
          )}

          {!listError && list !== null && shownCount > 0 && (
            <Card className="mt-5" innerClassName="p-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="px-4 py-3 text-left font-medium">순위</th>
                      <th className="px-4 py-3 text-left font-medium">닉네임</th>
                      <th className="px-4 py-3 text-right font-medium">실현손익</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.content.map((entry, index) => {
                      // 하이라이트 근거는 닉네임 문자열뿐이다(응답에 userId 가 없다). 확정이 아니라 힌트다.
                      const mine = me !== null && me.nickname === entry.nickname
                      return (
                        // rank 는 공동 순위로 중복되고(1,1,3) index+1 과도 다르다 → key 는 위치+닉네임 조합.
                        <tr
                          key={`${index}-${entry.nickname}`}
                          className={mine ? (isCrypto ? 'bg-coin-soft/50' : 'bg-brand-soft/50') : undefined}
                        >
                          <td className="px-4 py-3 text-ink tabular">
                            {entry.rank.toLocaleString('ko-KR')}
                          </td>
                          <td className="px-4 py-3 text-ink">
                            {entry.nickname}
                            {mine && (
                              <span className="ml-2 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted">
                                내 닉네임과 같음
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right tabular ${pnlTone(entry.realizedPnl)}`}>
                            {signedKRW(entry.realizedPnl)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {highlighted && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              표시한 행은 닉네임이 같아 찾은 것입니다. 랭킹에는 사용자 구분자가 없어 동명이인이면 다른
              사람일 수 있습니다. 정확한 내 순위는 위의 내 랭킹 카드를 봐 주세요.
            </p>
          )}

          {!listError && list !== null && shownCount > 0 && limit === TOP_LIMIT && (
            <div className="mt-6 flex justify-center">
              <Button variant="soft" onClick={() => setLimit(EXPANDED_LIMIT)}>
                더 보기
              </Button>
            </div>
          )}

          {/* 동점 처리 규칙을 알려 두지 않으면 2위가 없는 목록이 오류로 보인다. */}
          {!listError && list !== null && shownCount > 0 && (
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              실현손익이 같으면 공동 순위이며 그 인원수만큼 다음 순위를 건너뜁니다(예: 공동 1위 두 명 다음은 3위).
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
