// 사용자·시장별 영속 attempt를 진입 정본으로 사용하는 튜토리얼 페이지
import { useCallback, useEffect, useState } from 'react'
import { AttemptTutorialFlow } from '../components/tutorial/AttemptTutorialFlow'
import { Eyebrow } from '../components/ui/Eyebrow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { toUserMessage } from '../lib/errorMessages'
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
          : status === 'NOT_STARTED'
            ? '선택 대기'
            : '확인 전'
  return <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>{label} · {text}</span>
}

const emptyAttempts: Record<Market, PracticeAttemptResponse | null> = { STOCK: null, CRYPTO: null }
const emptyProgress: Record<Market, InvestmentPracticeResponse | null> = { STOCK: null, CRYPTO: null }

export function Tutorial() {
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

  return (
    <div className="relative min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="orb -top-24 right-1/4 h-72 w-72 animate-float-orb" aria-hidden />
      <main className="relative mx-auto max-w-4xl">
        <header>
          <Eyebrow>튜토리얼 · 영속 투자 실습</Eyebrow>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">
            하나의 차트에서 매수부터 복기까지
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            샘플 종목을 고르고 매수하면 서버가 체결가 기준 -3% 손절선과 +5% 익절선을 자동으로 고정합니다.
            사전 의도를 입력할 필요 없이 같은 29+1 차트를 관찰하며 매도와 복기까지 이어가세요. 새로고침은
            현재 실행을 그대로 이어가며, 다시 시작은 확인 후에만 주문과 보유를 안전하게 정리합니다.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <MarketTabs market={market} onChange={setMarket} />
            <StatusPill label="주식" progress={progressByMarket.STOCK} />
            <StatusPill label="코인" progress={progressByMarket.CRYPTO} />
          </div>
        </header>

        <section className="mt-8">
          {loadingMarket === market && (!attempt || !progress) ? (
            <div className="space-y-4">
              <div className="skeleton h-20" />
              <div className="skeleton h-80" />
              <div className="skeleton h-36" />
            </div>
          ) : attempt && progress ? (
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
          ) : (
            <p className="rounded-2xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
              {error ?? '튜토리얼을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}
            </p>
          )}
          {error && attempt && progress && <p className="mt-4 text-sm text-loss">{error}</p>}
        </section>
      </main>
    </div>
  )
}
