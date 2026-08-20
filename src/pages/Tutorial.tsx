// 사용자·시장별 영속 attempt를 진입 정본으로 사용하는 튜토리얼 페이지
import { useCallback, useEffect, useState } from 'react'
import { AttemptTutorialFlow } from '../components/tutorial/AttemptTutorialFlow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { toUserMessage } from '../lib/errorMessages'
import { formatManEok } from '../lib/format'
import { visibleTutorialMarkets } from '../lib/tutorialMarkets'
import { ensurePracticeAttempt, getPracticeProgress } from '../services/tutorialService'
import type { InvestmentPracticeResponse, PracticeAttemptResponse } from '../services/tutorialTypes'
import type { Market } from '../services/types'

function StatusPill({
  label,
  progress,
}: {
  label: string
  progress: InvestmentPracticeResponse | null
}) {
  const status = progress?.status ?? null
  // 응답 전에는 "확인 전" 같은 문구 대신 스켈레톤만 둔다 — 사용자가 해야 할 일로 읽히면 안 된다.
  if (status === null) return <span className="skeleton h-7 w-24 rounded-full" aria-hidden />
  const tone =
    status === 'COMPLETED'
      ? 'bg-brand-soft text-brand'
      : status === 'EXPIRED'
        ? 'bg-loss/10 text-loss ring-1 ring-loss/20'
        : status === 'IN_PROGRESS' || status === 'AWAITING_SALE'
          ? 'bg-white/[0.06] text-ink ring-1 ring-white/[0.1]'
          : 'bg-white/[0.04] text-muted ring-1 ring-white/[0.08]'
  const text =
    status === 'COMPLETED'
      ? '완료'
      : status === 'EXPIRED'
        ? '만료됨'
        : status === 'IN_PROGRESS' || status === 'AWAITING_SALE'
          ? '진행 중'
          : '아직 안 함'
  return <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>{label} · {text}</span>
}

const emptyAttempts: Record<Market, PracticeAttemptResponse | null> = { STOCK: null, CRYPTO: null }
const emptyProgress: Record<Market, InvestmentPracticeResponse | null> = { STOCK: null, CRYPTO: null }

export function Tutorial() {
  // 기본은 코인이다 — 주식 튜토리얼 입구를 닫아 둔 동안은 코인만 열려 있다(lib/tutorialMarkets.ts).
  const [market, setMarket] = useState<Market>('CRYPTO')
  const [attempts, setAttempts] = useState(emptyAttempts)
  const [progressByMarket, setProgressByMarket] = useState(emptyProgress)
  const [loadingMarket, setLoadingMarket] = useState<Market | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMarket = useCallback(async (targetMarket: Market) => {
    setLoadingMarket(targetMarket)
    setError(null)
    try {
      const ensured = await ensurePracticeAttempt(targetMarket)
      const progress = await getPracticeProgress(targetMarket)
      setAttempts((current) => ({ ...current, [targetMarket]: progress.attempt ?? ensured }))
      setProgressByMarket((current) => ({ ...current, [targetMarket]: progress }))
    } catch (loadError) {
      setError(toUserMessage(loadError))
    } finally {
      setLoadingMarket((current) => (current === targetMarket ? null : current))
    }
  }, [])

  const refreshMarket = useCallback(async (targetMarket: Market) => {
    const progress = await getPracticeProgress(targetMarket)
    setProgressByMarket((current) => ({ ...current, [targetMarket]: progress }))
    if (progress.attempt) {
      setAttempts((current) => ({ ...current, [targetMarket]: progress.attempt }))
    }
  }, [])

  const refreshCurrent = useCallback(() => refreshMarket(market), [market, refreshMarket])

  useEffect(() => {
    void loadMarket(market)
  }, [loadMarket, market])

  useEffect(() => {
    const otherMarket: Market = market === 'CRYPTO' ? 'STOCK' : 'CRYPTO'
    if (progressByMarket[otherMarket] !== null) return
    let cancelled = false
    getPracticeProgress(otherMarket)
      .then((progress) => {
        if (!cancelled) setProgressByMarket((current) => ({ ...current, [otherMarket]: progress }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [market, progressByMarket])

  const attempt = attempts[market]
  const progress = progressByMarket[market]
  const markets = visibleTutorialMarkets(market, progressByMarket.STOCK)
  const showBothMarkets = markets.length > 1
  const selecting = attempt?.status === 'SELECTING_INSTRUMENT' && progress !== null
  /**
   * rewardAmount 는 완료 전에는 null 이라 금액을 미리 알 수 없다. 그래서 금액은 응답에 실제로 값이
   * 있을 때만 노출하고, 없으면 "지급된다"는 사실만 적는다 — 확인 못 한 숫자를 문구로 만들지 않는다.
   */
  const rewardAmount =
    progressByMarket[market]?.rewardAmount ??
    progressByMarket.STOCK?.rewardAmount ??
    progressByMarket.CRYPTO?.rewardAmount ??
    null

  return (
    // 껍데기는 모의투자 화면(pages/Trade.tsx)과 같다 — 화면 높이를 꽉 채우고 페이지 자체는
    // 스크롤하지 않으며, 안쪽 컬럼이 각자 스크롤한다.
    <div className="relative flex h-[100dvh] flex-col overflow-hidden px-8 pb-8 pt-20 md:pt-24">
      <div className="orb -top-24 right-1/4 h-72 w-72 animate-float-orb" aria-hidden />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* 헤더 구성(가운데 정렬 · 큰 시장 탭 · 상태 배지 한 줄 · 설명 한 문단)도 모의투자 화면을 따른다. */}
        <header className="shrink-0 pb-3 pt-3 text-center">
          {/* 주식 튜토리얼 입구를 닫은 동안에도 이미 주식을 진행 중인 사용자에겐 탭을 남긴다. */}
          {showBothMarkets && (
            <MarketTabs market={market} onChange={setMarket} markets={markets} size="lg" />
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {/* 칩 순서는 MarketTabs의 탭 순서(코인 → 주식)를 따른다. 서로 뒤집혀 있으면 같은 줄에서
                좌우가 거울처럼 어긋나 어느 칩이 어느 탭인지 눈으로 짝지을 수 없다. */}
            <StatusPill label="코인" progress={progressByMarket.CRYPTO} />
            {showBothMarkets && <StatusPill label="주식" progress={progressByMarket.STOCK} />}
          </div>

          {/*
            "손절선·익절선이 자동으로 그려진다"는 문장은 뺐다 — 매수 단계(2단계)의 안내 문구와
            산 뒤에 뜨는 "내가 팔 기준선" 카드가 같은 말을 이미 하고 있어, 여기 있으면 셋이 겹친다.
            이 자리에는 여기서만 말하는 것(실제 돈이 아니다·보상 금액)만 남긴다(2026-08-20 피드백).
          */}
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            가짜 돈으로 {market === 'CRYPTO' ? '코인' : '주식'}을 한 번 사고, 팔아 보는 연습입니다. 실제
            돈은 한 푼도 들지 않습니다.{' '}
            {rewardAmount === null
              ? '한 시장을 처음 끝내면 연습용 투자금이 한 번 지급됩니다.'
              : `한 시장을 처음 끝내면 연습용 투자금 ${formatManEok(rewardAmount)}원이 한 번 지급됩니다.`}
          </p>
          {showBothMarkets && (
            <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-muted">
              주식과 코인은 서로 다른 연습입니다. 하나를 끝내도 다른 하나는 그대로 남아 있으니 따로 한
              번씩 해 보세요.
            </p>
          )}
          {selecting && (
            <p className="mt-3 text-sm font-medium text-ink">
              왼쪽 목록에서 종목을 하나 고르는 것부터 시작하세요.
            </p>
          )}
          {error && attempt && progress && <p className="mt-2 text-sm text-loss">{error}</p>}
        </header>

        {loadingMarket === market && (!attempt || !progress) ? (
          <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,20fr)_minmax(0,68fr)]">
            <div className="skeleton min-h-0" />
            <div className="skeleton min-h-0" />
          </div>
        ) : attempt && progress ? (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <AttemptTutorialFlow
              key={`${attempt.attemptId}:${attempt.runNumber}`}
              market={market}
              attempt={attempt}
              progress={progress}
              onAttemptChange={(nextAttempt) =>
                setAttempts((current) => ({ ...current, [market]: nextAttempt }))
              }
              onRefresh={refreshCurrent}
            />
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
            {error ?? '튜토리얼을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}
          </p>
        )}
      </div>
    </div>
  )
}
