// 매도 직후 피드백 (FEED-007 + 반사실 FEED-010 + 집단 비교 FEED-011). 섹션마다 자기 status 로 따로 렌더한다
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Eyebrow } from '../ui/Eyebrow'
import { formatHhMm } from '../../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { formatKRW, formatPnl, pnlTone } from '../../lib/format'
import {
  formatMinutes,
  formatOriginDate,
  formatRatePercent,
  formatSharePercent,
  getPostSellFeedback,
} from '../../services/feedbackService'
import type {
  CounterfactualScenario,
  Counterfactuals,
  PeerComparison,
  PostSellFeedbackResponse,
  PostSellFlow,
} from '../../services/feedbackTypes'
import { SourceList } from './PriceMoveCards'

interface Props {
  tradeId: number
}

/** 값 한 칸. 서버가 안 준 자리는 빈 문자열 대신 —(값 없음)으로 명시한다. */
function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular text-sm ${tone || 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function SectionShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-xl bg-elevated p-4">
      <h4 className="font-display text-sm font-semibold text-ink">{title}</h4>
      {children}
    </section>
  )
}

function NotYetNote({ text }: { text: string }) {
  return <p className="mt-2 text-xs leading-relaxed text-muted">{text}</p>
}

/** 반사실 한 행. 라벨은 사실형만 쓴다 — 가정법("안 팔았다면")은 서버 후검증이 금지한 표현이라 화면에도 쓰지 않는다. */
function ScenarioRow({
  label,
  scenario,
}: {
  label: string
  scenario: CounterfactualScenario | null
}) {
  if (!scenario) {
    return (
      <div className="flex items-baseline justify-between gap-3 border-t border-line py-2">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-sm text-muted">—</span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line py-2">
      <span className="text-xs text-muted">
        {label}
        <span className="ml-2 text-[10px]">{formatHhMm(scenario.at)}</span>
      </span>
      <span className="tabular text-sm text-ink">
        {formatKRW(scenario.price)}
        {/* returnRate 는 시나리오 가격 기준으로 수수료를 다시 계산한 서버 값이다. 재계산 금지. */}
        <span className={`ml-3 font-semibold ${pnlTone(scenario.returnRate)}`}>
          {formatRatePercent(scenario.returnRate)}
        </span>
      </span>
    </div>
  )
}

/** 매도 후 흐름. 객체가 null(=계산 불가)인 경우는 호출부가 걸러 내고, 여기서는 status 만 본다. */
function PostSellFlowSection({ flow }: { flow: PostSellFlow }) {
  return (
    <SectionShell title="매도 후 흐름">
      {flow.status !== 'READY' ? (
        <NotYetNote text="이 체결의 원본 거래일 장 마감(15:30) 이후에 공개됩니다. 마감 후 다시 확인해 주세요." />
      ) : (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <Stat label="종가" value={flow.closePrice === null ? '—' : formatKRW(flow.closePrice)} />
          <Stat label="종가 시각" value={flow.closeAt === null ? '—' : formatHhMm(flow.closeAt)} />
          <Stat
            label="매도가 대비 종가"
            value={flow.sellToCloseRate === null ? '—' : formatRatePercent(flow.sellToCloseRate)}
            tone={flow.sellToCloseRate === null ? '' : pnlTone(flow.sellToCloseRate)}
          />
          <Stat
            label="매도 후 최고가"
            value={flow.postSellHighPrice === null ? '—' : formatKRW(flow.postSellHighPrice)}
          />
          <Stat
            label="매도 후 최고가 시각"
            value={flow.postSellHighAt === null ? '—' : formatHhMm(flow.postSellHighAt)}
          />
        </dl>
      )}
    </SectionShell>
  )
}

function CounterfactualSection({
  cf,
  sellAt,
  sellPrice,
  returnRate,
}: {
  cf: Counterfactuals
  sellAt: string
  sellPrice: number
  returnRate: number
}) {
  return (
    <SectionShell title="다른 시점 기준 수익률">
      {cf.status !== 'READY' ? (
        // 표 자체를 그리지 않는다. 빈 값 3행을 그리면 "계산이 끝났는데 값이 없다"로 읽힌다.
        <NotYetNote text="이 체결의 원본 거래일 장 마감(15:30) 이후에 공개됩니다." />
      ) : (
        <div className="mt-3">
          {/* 고정 키 3개짜리 객체다. 배열이 아니라 순회 대신 키로 접근하고 표시 순서는 화면이 정한다. */}
          <ScenarioRow label="종가 기준" scenario={cf.atClose} />
          <ScenarioRow label="보유 중 최고가 기준" scenario={cf.atHoldHigh} />
          <ScenarioRow label="매수 후 첫 변동 시점 기준" scenario={cf.atFirstMoveAfterBuy} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line py-2">
            <span className="text-xs text-ink">
              실제 매도
              <span className="ml-2 text-[10px] text-muted">{formatHhMm(sellAt)}</span>
            </span>
            <span className="tabular text-sm text-ink">
              {formatKRW(sellPrice)}
              <span className={`ml-3 font-semibold ${pnlTone(returnRate)}`}>
                {formatRatePercent(returnRate)}
              </span>
            </span>
          </div>
        </div>
      )}
    </SectionShell>
  )
}

/**
 * 집단 비교. 게이트 축이 매도 후 흐름·반사실과 달라(시각이 아니라 확정 집계 행의 존재)
 * `postSellFlow=READY` 인데 여기만 `NOT_YET` 인 구간이 실제로 존재한다 — 하나의 boolean 게이트로 묶지 않는다.
 */
function PeerComparisonSection({ peer }: { peer: PeerComparison }) {
  return (
    <SectionShell title="같은 구간을 보유한 사람들">
      {peer.status === 'NOT_YET' && (
        <NotYetNote text="장 마감 집계가 끝나면 공개됩니다. 매도 후 흐름보다 조금 늦게 열립니다." />
      )}

      {peer.status === 'NO_EVENT' && (
        // 모든 필드가 null 이다. priceMoveId 로 카드를 찾는 코드가 여기서 터진다.
        <NotYetNote text="보유 구간에 근거가 확인된 변동 이벤트가 없어 비교할 기준 구간이 없습니다." />
      )}

      {peer.status === 'INSUFFICIENT_SAMPLE' && (
        <>
          <NotYetNote text="같은 구간 보유자가 5명 미만이라 집단 지표를 표시하지 않습니다." />
          {/* 모집단 지표 3종만 null 이고 본인 값은 살아 있다. 전체를 숨기면 이 값을 잃는다. */}
          <dl className="mt-3">
            <Stat
              label="기준 구간 이후 내 매도까지"
              value={
                peer.yourMinutesToSell === null ? '—' : formatMinutes(peer.yourMinutesToSell)
              }
            />
          </dl>
        </>
      )}

      {peer.status === 'READY' && (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <Stat
            label="같은 구간 보유자"
            value={peer.holderCount === null ? '—' : `${peer.holderCount.toLocaleString('ko-KR')}명`}
          />
          <Stat
            label="30분 내 매도 비중"
            value={
              peer.soldWithin30MinRate === null
                ? '—'
                : formatSharePercent(peer.soldWithin30MinRate)
            }
          />
          <Stat
            label="중앙값 매도까지"
            value={
              peer.medianMinutesToSell === null ? '—' : formatMinutes(peer.medianMinutesToSell)
            }
          />
          <Stat
            label="내 매도까지"
            value={peer.yourMinutesToSell === null ? '—' : formatMinutes(peer.yourMinutesToSell)}
          />
        </dl>
      )}
    </SectionShell>
  )
}

export function PostSellFeedback({ tradeId }: Props) {
  const [data, setData] = useState<PostSellFeedbackResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 400 은 "코인 체결" 또는 "매수 체결"인데 code 가 둘 다 VALIDATION_ERROR 라 원인을 구분할 수 없다. */
  const [notEligible, setNotEligible] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setNotEligible(false)
    try {
      setData(await getPostSellFeedback(tradeId))
    } catch (e) {
      if (isApiErrorCode(e, 'VALIDATION_ERROR')) {
        // tradeId 가 바뀌어 대상 밖 체결이 된 경우 이전 체결의 표를 남겨 두면 안 된다.
        setData(null)
        setNotEligible(true)
        return
      }
      setError(
        toUserMessage(e, {
          FORBIDDEN: '다른 사람의 체결은 조회할 수 없습니다.',
          NOT_FOUND: '존재하지 않는 체결입니다.',
        }),
      )
    }
  }, [tradeId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card accent="brand">
      <div className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div>
            <Eyebrow>매도 회고</Eyebrow>
            <h3 className="mt-2 font-display text-base font-semibold text-ink">
              {data ? data.name : '매도 직후 피드백'}
              {data && <span className="ml-2 text-xs font-normal text-muted">{data.symbol}</span>}
            </h3>
          </div>
          {data && (
            // buyAt·sellAt 은 오늘이 아니라 원본 거래일 축이다. 날짜를 라벨로 명시하지 않으면 사용자가 자기 거래내역과 어긋난다고 느낀다.
            <span className="text-[10px] text-muted">
              {formatOriginDate(data.sellAt.slice(0, 10))} 원본 거래일 기준
            </span>
          )}
        </div>

        {notEligible && (
          <div className="mt-4 rounded-xl bg-elevated p-4">
            <p className="text-sm font-semibold text-ink">이 체결은 매도 회고 대상이 아닙니다</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              매도 회고는 주식 매도 체결에만 제공됩니다. 코인 체결이거나 매수 체결이면 표시되지 않습니다.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <p className="text-sm text-rose-300">{error}</p>
            <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </div>
        )}

        {data === null && !error && !notEligible && (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-24" />
            <div className="skeleton h-32" />
          </div>
        )}

        {data && (
          <>
            {/* 원장 수치 — 항상 채워진다. holdingMinutes 만 예외적으로 null 일 수 있다. */}
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              <Stat label="매수 평균단가" value={formatKRW(data.buyPrice)} />
              <Stat label="매도가" value={formatKRW(data.sellPrice)} />
              <Stat label="수량" value={`${data.quantity.toLocaleString('ko-KR')}주`} />
              <Stat label="매도 수수료" value={formatKRW(data.fee)} />
              <Stat
                label="실현 손익"
                value={formatPnl(data.realizedPnl)}
                tone={pnlTone(data.realizedPnl)}
              />
              <Stat
                label="수익률"
                value={formatRatePercent(data.returnRate)}
                tone={pnlTone(data.returnRate)}
              />
              <Stat
                label="보유 시간"
                // sameSessionCompleted=false 여도 대개 값이 있다. 매수·매도 시각이 역전된 조합에서만 null 이다.
                value={data.holdingMinutes === null ? '—' : formatMinutes(data.holdingMinutes)}
              />
              <Stat
                label="매수·매도 시각"
                value={`${formatHhMm(data.buyAt)} → ${formatHhMm(data.sellAt)}`}
              />
            </dl>

            {/* buyPrice·buyAt 의 의미를 밝힌다. 여러 lot 에 배분된 매도에서 거래내역과 대조하다 혼란을 겪는 자리다. */}
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              매수 평균단가는 이번 매도에 배분된 매수분의 가중평균이고, 매수 시각은 그중 가장 이른 체결
              시각입니다. 두 시각 모두 재생한 원본 거래일의 시각입니다.
            </p>

            {!data.sameSessionCompleted && (
              <div className="mt-5 rounded-xl bg-elevated p-4">
                <p className="text-sm font-semibold text-ink">
                  여러 거래일에 걸친 매매라 보유 구간 분석이 없습니다
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  매수와 매도의 원본 거래일이 달라 분봉이 이어지지 않습니다. 보유 구간 고저·매도 후
                  흐름·반사실·집단 비교는 계산되지 않습니다.
                </p>
              </div>
            )}

            {/* 파생 사실 — sameSessionCompleted=true 일 때만 값이 있다. */}
            {data.sameSessionCompleted && (
              <SectionShell title="보유 구간">
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Stat
                    label="보유 중 최고가"
                    value={
                      data.holdHighPrice === null
                        ? '—'
                        : `${formatKRW(data.holdHighPrice)}${data.holdHighAt ? ` (${formatHhMm(data.holdHighAt)})` : ''}`
                    }
                  />
                  <Stat
                    label="보유 중 최저가"
                    value={
                      data.holdLowPrice === null
                        ? '—'
                        : `${formatKRW(data.holdLowPrice)}${data.holdLowAt ? ` (${formatHhMm(data.holdLowAt)})` : ''}`
                    }
                  />
                  <Stat
                    label="최고가 대비 매도가"
                    value={data.sellVsHighRate === null ? '—' : formatRatePercent(data.sellVsHighRate)}
                    tone={data.sellVsHighRate === null ? '' : pnlTone(data.sellVsHighRate)}
                  />
                  <Stat
                    label="최저가 대비 매도가"
                    value={data.sellVsLowRate === null ? '—' : formatRatePercent(data.sellVsLowRate)}
                    tone={data.sellVsLowRate === null ? '' : pnlTone(data.sellVsLowRate)}
                  />
                </dl>
                {/* 양수면 매수가 기사보다 앞섰다는 뜻이다. 근거 기사가 없으면 null 이라 이 줄을 아예 그리지 않는다. */}
                {data.buyToNewsMinutes !== null && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    {data.buyToNewsMinutes >= 0
                      ? `매수가 첫 근거 기사보다 ${formatMinutes(data.buyToNewsMinutes)} 앞섰습니다.`
                      : `첫 근거 기사 이후 ${formatMinutes(data.buyToNewsMinutes)} 뒤에 매수했습니다.`}
                  </p>
                )}
              </SectionShell>
            )}

            {/* 보유 구간 안의 변동 카드. sameSessionCompleted=false 면 null 이 아니라 [] 다. */}
            {data.priceMoves.length > 0 && (
              <SectionShell title="보유 구간에 있었던 변동">
                <ul className="mt-3 space-y-3">
                  {data.priceMoves.map((move) => (
                    <li key={move.id} className="rounded-lg bg-surface p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-xs text-muted">
                          {formatHhMm(move.windowStart)}–{formatHhMm(move.windowEnd)}
                          <span className="ml-2 text-[10px]">
                            매수 {formatMinutes(move.minutesAfterBuy)} 뒤 · 매도{' '}
                            {formatMinutes(move.minutesBeforeSell)} 전
                          </span>
                        </span>
                        <span className={`tabular text-sm font-semibold ${pnlTone(move.changeRate)}`}>
                          {formatRatePercent(move.changeRate)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink">{move.narrative}</p>
                      <SourceList sources={move.sources} />
                    </li>
                  ))}
                </ul>
              </SectionShell>
            )}

            {/*
              아래 세 섹션은 객체가 null 이면(=sameSessionCompleted:false) 통째로 숨긴다.
              null 과 status='NOT_YET' 은 다른 상태다 — 전자는 영구히 계산 불가, 후자는 나중에 채워진다.
              그리고 세 섹션은 게이트 축이 달라 각자 자기 status 로만 판정한다.
            */}
            {data.postSellFlow && <PostSellFlowSection flow={data.postSellFlow} />}
            {data.counterfactuals && (
              <CounterfactualSection
                cf={data.counterfactuals}
                sellAt={data.sellAt}
                sellPrice={data.sellPrice}
                returnRate={data.returnRate}
              />
            )}
            {data.peerComparison && <PeerComparisonSection peer={data.peerComparison} />}

            {/* 서술은 항상 채워진다(템플릿 폴백). narrativeStatus 로 분기할 필요가 없다. */}
            <SectionShell title="요약">
              <p className="mt-2 text-sm leading-relaxed text-ink">{data.narrative}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {data.narrativeSource === 'TEMPLATE' ? '자동 생성 문장' : 'AI 생성 문장'} · 장 마감
                집계가 끝나면 이 문장이 다시 만들어질 수 있습니다.
              </p>
            </SectionShell>

            <Button type="button" size="sm" variant="ghost" className="mt-4" onClick={() => void load()}>
              다시 불러오기
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
