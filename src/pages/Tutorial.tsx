// 사용자·시장별 영속 attempt를 진입 정본으로 사용하는 튜토리얼 페이지
import { useCallback, useEffect, useRef, useState } from 'react'
import { AttemptTutorialFlow } from '../components/tutorial/AttemptTutorialFlow'
import { MarketTabs } from '../components/ui/MarketTabs'
import { toUserMessage } from '../lib/errorMessages'
import { formatManEok } from '../lib/format'
import { visibleTutorialMarkets } from '../lib/tutorialMarkets'
import { ensurePracticeAttempt, getPracticeProgress } from '../services/tutorialService'
import type { InvestmentPracticeResponse, PracticeAttemptResponse } from '../services/tutorialTypes'
import type { Market } from '../services/types'

/** 잔액 세 필드만 따로 뗀 것 — 진행 조회(GET) 응답이 이 세 필드를 늘 0으로 죽여 보내는 것과
 *  섞이지 않도록 별도로 들고 있는다(이슈 #502, tutorialTypes.ts의 PracticeAttemptResponse 주석). */
type TutorialBalance = Pick<
  PracticeAttemptResponse,
  'tutorialCashBalance' | 'tutorialAvailableCash' | 'tutorialRealizedPnl'
>

function pickBalance(attempt: PracticeAttemptResponse): TutorialBalance {
  return {
    tutorialCashBalance: attempt.tutorialCashBalance,
    tutorialAvailableCash: attempt.tutorialAvailableCash,
    tutorialRealizedPnl: attempt.tutorialRealizedPnl,
  }
}

/**
 * 잔액이 움직였는지를 진행 조회만으로 알아내는 지문. 튜토리얼 현금은 **매수·매도가 체결될 때** 움직이고,
 * 그 체결 흔적은 단계별 evidence(체결 id·수량)에 남는다.
 *
 * 왜 필요한가 — 진행 조회는 잔액 세 필드를 늘 `0`으로 준다(이슈 #502. `0`은 "잔고가 0"이 아니라 "이
 * 응답은 계좌를 조회하지 않았다"는 뜻이라 그대로 그리면 안 된다). 실제 잔액은 쓰기 경로 네 곳에서만
 * 오는데, 그중 `ensurePracticeAttempt`는 멱등이라 다시 불러도 되지만 tick마다(3초) 부르면 폴링이
 * 쓰기가 된다. 그래서 **체결이 실제로 생긴 tick에서만** 한 번 더 부른다.
 */
function tradeFingerprint(progress: InvestmentPracticeResponse): string {
  const trades = progress.steps
    .map(({ evidence }) =>
      [
        evidence.buyTradeId,
        evidence.sellTradeId,
        evidence.buyQuantity,
        evidence.sellQuantity,
        evidence.remainingQuantity,
      ].join(':'),
    )
    .join('|')
  // 재시작·완료는 evidence를 통째로 갈아 끼우지만, 세대와 상태도 같이 넣어 두면 흔적이 우연히 같아지는
  // 자리에서도 잔액을 새로 읽는다.
  return `${progress.attempt?.runNumber ?? '-'}#${progress.attempt?.status ?? '-'}#${trades}`
}

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
const emptyBalances: Record<Market, TutorialBalance | null> = { STOCK: null, CRYPTO: null }

export function Tutorial() {
  // 기본은 코인이다 — 주식 튜토리얼 입구를 닫아 둔 동안은 코인만 열려 있다(lib/tutorialMarkets.ts).
  const [market, setMarket] = useState<Market>('CRYPTO')
  const [attempts, setAttempts] = useState(emptyAttempts)
  const [progressByMarket, setProgressByMarket] = useState(emptyProgress)
  const [loadingMarket, setLoadingMarket] = useState<Market | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 쓰기 응답 네 곳(진입·재시작·종목 선택·프리셋 선택)에서만 채우는 잔액. ref로도 들고 있어
   *  refreshMarket이 최신 값을 클로저 갱신 없이 읽는다(관찰 tick의 observeStateRef와 같은 패턴). */
  const [balances, setBalances] = useState(emptyBalances)
  const balancesRef = useRef(balances)
  useEffect(() => {
    balancesRef.current = balances
  }, [balances])
  /** 잔액을 마지막으로 읽었을 때의 체결 지문. 이게 바뀐 tick에서만 잔액을 다시 읽는다. */
  const fingerprintRef = useRef<Record<Market, string | null>>({ STOCK: null, CRYPTO: null })

  /** 실잔액을 싣고 오는 쓰기 경로를 한 번 불러 balances·ref를 함께 올린다. 실패는 삼킨다 —
   *  잔액 갱신 때문에 진행 폴링이 오류 화면으로 덮이면 안 되고, 지문을 안 올려 두면 다음 tick에 다시 시도한다. */
  const readBalance = useCallback(async (targetMarket: Market): Promise<TutorialBalance | null> => {
    try {
      const balance = pickBalance(await ensurePracticeAttempt(targetMarket))
      balancesRef.current = { ...balancesRef.current, [targetMarket]: balance }
      setBalances((current) => ({ ...current, [targetMarket]: balance }))
      return balance
    } catch {
      return null
    }
  }, [])

  const loadMarket = useCallback(async (targetMarket: Market) => {
    setLoadingMarket(targetMarket)
    setError(null)
    try {
      const ensured = await ensurePracticeAttempt(targetMarket)
      const progress = await getPracticeProgress(targetMarket)
      const balance = pickBalance(ensured)
      fingerprintRef.current[targetMarket] = tradeFingerprint(progress)
      setBalances((current) => ({ ...current, [targetMarket]: balance }))
      setAttempts((current) => ({
        ...current,
        [targetMarket]: progress.attempt ? { ...progress.attempt, ...balance } : ensured,
      }))
      setProgressByMarket((current) => ({ ...current, [targetMarket]: progress }))
    } catch (loadError) {
      setError(toUserMessage(loadError))
    } finally {
      setLoadingMarket((current) => (current === targetMarket ? null : current))
    }
  }, [])

  const refreshMarket = useCallback(
    async (targetMarket: Market) => {
      const progress = await getPracticeProgress(targetMarket)
      setProgressByMarket((current) => ({ ...current, [targetMarket]: progress }))
      if (!progress.attempt) return
      const attempt = progress.attempt

      /**
       * 매수·매도가 체결된 tick이면 잔액을 다시 읽는다. 예전에는 진행 조회의 `0`을 무시하고 마지막으로
       * 알려진 값을 그대로 들고 있기만 해서(이슈 #502), 사고팔아도 "주문 가능" 금액이 진입 시점 그대로
       * 멈춰 있었다 — 그 숫자로 채우는 "최대" 버튼이 수수료·실현손실만큼 초과 주문을 만들어 서버가
       * 거절했다. `0`을 무시하는 규칙은 그대로 두고(진행 조회는 여전히 계좌를 안 읽는다), 체결이 생긴
       * 자리에서만 실값을 새로 받아 온다.
       */
      const fingerprint = tradeFingerprint(progress)
      let balance = balancesRef.current[targetMarket] ?? pickBalance(attempt)
      if (fingerprint !== fingerprintRef.current[targetMarket]) {
        const refreshed = await readBalance(targetMarket)
        if (refreshed) {
          balance = refreshed
          fingerprintRef.current[targetMarket] = fingerprint
        }
      }
      setAttempts((current) => ({ ...current, [targetMarket]: { ...attempt, ...balance } }))
    },
    [readBalance],
  )

  /** ensurePracticeAttempt 외의 쓰기 응답(종목 선택·프리셋 선택·재시작)이 부르는 공통 경로.
   *  세 호출 모두 실제 잔액을 싣고 오므로(이슈 #502) 여기서 balances도 함께 갱신한다. */
  const applyAttemptUpdate = useCallback((targetMarket: Market, next: PracticeAttemptResponse) => {
    setBalances((current) => ({ ...current, [targetMarket]: pickBalance(next) }))
    setAttempts((current) => ({ ...current, [targetMarket]: next }))
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
        {/* 헤더 구성(가운데 정렬 · 시장 탭 · 상태 배지 한 줄 · 설명 한 문단)도 모의투자 화면을 따른다.
            탭 크기는 다른 화면과 통일해 기본(md) — size="lg" 는 뗀다(2026-08-22 피드백). */}
        <header className="shrink-0 pb-3 pt-3 text-center">
          {/* 주식 튜토리얼 입구를 닫은 동안에도 이미 주식을 진행 중인 사용자에겐 탭을 남긴다. */}
          {showBothMarkets && (
            <MarketTabs market={market} onChange={setMarket} markets={markets} />
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

            첫 문장은 **무엇을 배우는가**를 말한다(2026-08-21 튜터 피드백). "한 번 사고 팔아 보는
            연습"은 조작만 말해서, 이 튜토리얼의 목표(감정이 아니라 규칙으로 판다)가 화면 어디에도
            없었다. 주식은 예약 경로가 없어 그 목표가 성립하지 않으므로 시장별로 갈라 쓴다.
          */}
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {market === 'CRYPTO'
              ? '값이 흔들릴 때 감정으로 팔지 않도록, 팔 기준을 미리 정해 두는 연습입니다.'
              : '가짜 돈으로 주식을 한 번 사고, 팔아 보는 연습입니다.'}{' '}
            실제 돈은 한 푼도 들지 않습니다.{' '}
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
              onAttemptChange={(nextAttempt) => applyAttemptUpdate(market, nextAttempt)}
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
