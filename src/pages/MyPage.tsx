// 내정보 — 프로필, 총 보유자산·수익률, 튜토리얼 보상, 실시간 매매 내역 허브 페이지
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { tradeService } from '../services/tradeService'
import { tutorialService } from '../services/tutorialService'
import type {
  DecisionLog,
  Market,
  PortfolioSummary,
  TradeRecord,
  TutorialProgress,
} from '../services/types'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { LinkButton } from '../components/ui/Button'
import { ArrowUpRight, Check, Chart, Close, Coin, Sparkle, User as UserIcon } from '../components/ui/icons'
import { basisLabels, sideLabels } from '../lib/labels'
import { formatDate, formatKRW, formatManEok, formatPercent, pnlTone } from '../lib/format'

export function MyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [version, setVersion] = useState(0)
  const [progress, setProgress] = useState<TutorialProgress[]>([])
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [logs, setLogs] = useState<DecisionLog[]>([])
  const [claiming, setClaiming] = useState<string | null>(null)
  const [detail, setDetail] = useState<TradeRecord | null>(null)

  const stockId = user ? tradeService.getAccountId(user.id, 'STOCK') : null
  const cryptoId = user ? tradeService.getAccountId(user.id, 'CRYPTO') : null

  // 시세 틱으로 평가금액 실시간 갱신
  useEffect(() => {
    const id = setInterval(() => {
      tradeService.tick()
      setVersion((v) => v + 1)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  // 튜토리얼 진행 + 매매 내역 로드
  useEffect(() => {
    if (!user) return
    let alive = true
    tutorialService.getProgress(user.id).then((p) => alive && setProgress(p))
    Promise.all([
      stockId ? tradeService.getTrades(stockId) : Promise.resolve([]),
      cryptoId ? tradeService.getTrades(cryptoId) : Promise.resolve([]),
      stockId ? tradeService.getDecisionLogs(stockId) : Promise.resolve([]),
      cryptoId ? tradeService.getDecisionLogs(cryptoId) : Promise.resolve([]),
    ]).then(([s, c, sl, cl]) => {
      if (!alive) return
      const merged = [...s, ...c].sort(
        (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
      )
      setTrades(merged)
      setLogs([...sl, ...cl])
      // DEV 캡처용: ?detail=1 쿼리면 가장 오래된 거래(투자일기 보유)의 상세 모달을 연다
      if (
        import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get('detail') === '1' &&
        merged.length
      ) {
        setDetail(merged[merged.length - 1])
      }
    })
    return () => {
      alive = false
    }
  }, [user, stockId, cryptoId, version])

  const stock = useMemo(
    () => (stockId ? tradeService.getSummarySync(stockId) : null),
    [stockId, version],
  )
  const crypto = useMemo(
    () => (cryptoId ? tradeService.getSummarySync(cryptoId) : null),
    [cryptoId, version],
  )

  if (!user) {
    return (
      <div className="min-h-[100dvh] px-4 pt-40 text-center text-muted">로그인이 필요합니다.</div>
    )
  }

  const totalValue = (stock?.totalValue ?? 0) + (crypto?.totalValue ?? 0)
  const totalCapital = (stock?.investedCapital ?? 0) + (crypto?.investedCapital ?? 0)
  const totalRealized = (stock?.realizedPnl ?? 0) + (crypto?.realizedPnl ?? 0)
  const totalUnrealized = (stock?.unrealizedPnl ?? 0) + (crypto?.unrealizedPnl ?? 0)
  const totalReturn = totalCapital ? ((totalValue - totalCapital) / totalCapital) * 100 : 0
  const earnedBonus = progress
    .filter((p) => p.claimed)
    .reduce((sum, p) => sum + Math.round((stock?.seedAmount ?? 0) * p.step.rewardRate) * 2, 0)

  const claim = async (stepId: string) => {
    setClaiming(stepId)
    try {
      const result = await tutorialService.claim(user.id, stepId)
      setProgress(result.progress)
      setVersion((v) => v + 1)
    } catch {
      // 이미 수령했거나 미완료 — 조용히 무시하고 진행 상태만 새로고침
      const p = await tutorialService.getProgress(user.id)
      setProgress(p)
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>내정보</Eyebrow>

        {/* 프로필 + 총 보유자산 */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <div className="flex items-center gap-4 p-6">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <UserIcon width={26} height={26} />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-semibold">{user.nickname}</h1>
                <p className="truncate text-sm text-muted">{user.email}</p>
                <p className="mt-1 text-xs text-muted">가입일 {formatDate(user.createdAt)}</p>
              </div>
            </div>
          </Card>

          <Card accent="brand">
            <div className="p-6">
              <p className="text-xs text-muted">총 보유자산 (주식 + 코인)</p>
              <p className="mt-1 font-display text-4xl font-bold tabular">{formatManEok(totalValue)}</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <TinyStat label="총 수익률" value={formatPercent(totalReturn)} tone={pnlTone(totalReturn)} />
                <TinyStat label="평가손익" value={signed(totalUnrealized)} tone={pnlTone(totalUnrealized)} />
                <TinyStat label="실현손익" value={signed(totalRealized)} tone={pnlTone(totalRealized)} />
              </div>
            </div>
          </Card>
        </div>

        {/* 계좌별 요약 — 클릭 시 해당 시장 포트폴리오 상세로 이동 */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <AccountCard
            summary={stock}
            accent="stock"
            title="주식 계좌"
            icon={<Chart width={18} height={18} />}
            onDetail={() => navigate('/portfolio', { state: { market: 'STOCK' satisfies Market } })}
          />
          <AccountCard
            summary={crypto}
            accent="coin"
            title="코인 계좌"
            icon={<Coin width={18} height={18} />}
            onDetail={() => navigate('/portfolio', { state: { market: 'CRYPTO' satisfies Market } })}
          />
        </div>

        {/* 튜토리얼 보상 */}
        <div className="mt-10 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">입문자 튜토리얼</h2>
            <p className="mt-1 text-sm text-muted">
              단계를 완료하면 초기지급액의 일부가 각 계좌에 보너스로 지급됩니다.
            </p>
          </div>
          {earnedBonus > 0 && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-600">
              +{formatKRW(earnedBonus)} 수령
            </span>
          )}
        </div>

        <Card className="mt-4">
          <div className="divide-y divide-line">
            {progress.map((p) => (
              <div key={p.step.id} className="flex items-center gap-4 px-6 py-4">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                    p.claimed
                      ? 'bg-emerald-500 text-white'
                      : p.completed
                        ? 'bg-brand-soft text-brand'
                        : 'bg-black/[0.04] text-muted'
                  }`}
                >
                  {p.claimed ? <Check width={16} height={16} /> : p.step.order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.step.title}
                    <span className="ml-2 text-xs font-medium text-brand">
                      +{(p.step.rewardRate * 100).toFixed(0)}%
                    </span>
                  </p>
                  <p className="truncate text-sm text-muted">{p.step.description}</p>
                </div>
                {p.claimed ? (
                  <span className="flex-none text-sm text-emerald-600">수령 완료</span>
                ) : p.completed ? (
                  <button
                    onClick={() => claim(p.step.id)}
                    disabled={claiming === p.step.id}
                    className="flex-none rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    {claiming === p.step.id ? '지급 중…' : '보상 받기'}
                  </button>
                ) : (
                  <span className="flex-none rounded-full bg-black/[0.04] px-3 py-1.5 text-xs text-muted">
                    진행 전
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 실시간 매매 내역 */}
        <div className="mt-10 flex items-center gap-2">
          <h2 className="font-display text-2xl font-semibold">최근 매매 내역</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> 실시간
          </span>
        </div>

        <Card className="mt-4">
          {trades.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              아직 거래가 없습니다. 첫 매매를 시작해 보세요.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {trades.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetail(t)}
                  className="group flex w-full items-center gap-4 px-6 py-4 text-left transition-colors duration-300 hover:bg-black/[0.02]"
                >
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-xs font-medium ${
                      t.side === 'BUY' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {sideLabels[t.side]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.instrumentName}</p>
                    <p className="text-xs text-muted">{formatDate(t.executedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-semibold tabular">{formatKRW(Math.round(t.amount))}</p>
                    <p className="text-xs text-muted tabular">
                      {formatKRW(Math.round(t.price))} × {t.quantity}
                    </p>
                  </div>
                  <ArrowUpRight
                    width={15}
                    height={15}
                    className="flex-none text-muted opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/trade" withIcon>
            거래하러 가기
          </LinkButton>
          <LinkButton to="/portfolio" variant="ghost" withIcon>
            포트폴리오 상세
          </LinkButton>
        </div>
      </div>

      {/* 매매 상세 모달 */}
      {detail && (
        <TradeDetailModal
          trade={detail}
          log={logs.find((l) => l.tradeId === detail.id) ?? null}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

function TradeDetailModal({
  trade,
  log,
  onClose,
}: {
  trade: TradeRecord
  log: DecisionLog | null
  onClose: () => void
}) {
  const buy = trade.side === 'BUY'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="매매 상세"
    >
      {/* 배경 클릭 시 닫기 */}
      <button
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-bezel bg-white shadow-soft-lg">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                buy ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              {sideLabels[trade.side]}
            </span>
            <h3 className="font-display text-lg font-semibold">{trade.instrumentName}</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.04] text-muted transition-colors hover:bg-black/[0.08] hover:text-ink"
            aria-label="닫기"
          >
            <Close width={16} height={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          <p className="font-display text-3xl font-bold tabular">
            {formatKRW(Math.round(trade.amount))}
          </p>
          <p className="mt-1 text-xs text-muted">{formatDate(trade.executedAt)} 체결</p>

          <div className="mt-5 grid grid-cols-2 gap-y-3 rounded-2xl bg-canvas p-4 text-sm">
            <DetailRow label="체결 단가" value={formatKRW(Math.round(trade.price))} />
            <DetailRow label="수량" value={`${trade.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 8 })}`} />
            <DetailRow label="거래 금액" value={formatKRW(Math.round(trade.amount))} />
            <DetailRow label="수수료" value={formatKRW(trade.fee)} />
          </div>

          {log ? (
            <div className="mt-5">
              <p className="text-sm font-medium">투자일기</p>
              <div className="mt-2 rounded-2xl border border-line p-4">
                <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-muted">
                  {basisLabels[log.basis]}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-ink/85">{log.memo || '메모 없음.'}</p>
              </div>
              {log.aiReview ? (
                <div className="mt-3 rounded-2xl bg-brand-soft/60 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
                    <Sparkle width={14} height={14} /> AI 복기
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink/85">{log.aiReview}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-xs text-muted">
                  AI 복기 대기 중입니다. 일정 시간 후 당시 판단과 실제 흐름을 대조해 알려드립니다.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-canvas px-4 py-3 text-xs text-muted">
              이 거래에는 투자일기가 없습니다. 다음 매매부터 근거를 남겨보세요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between pr-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  )
}

function signed(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatManEok(Math.abs(value))}`
}

function TinyStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-base font-semibold tabular ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  )
}

function AccountCard({
  summary,
  accent,
  title,
  icon,
  onDetail,
}: {
  summary: PortfolioSummary | null
  accent: 'stock' | 'coin'
  title: string
  icon: ReactNode
  onDetail: () => void
}) {
  const color = accent === 'stock' ? 'text-stock' : 'text-coin'
  const bg = accent === 'stock' ? 'bg-stock/10' : 'bg-coin/15'
  return (
    <Card accent={accent}>
      <button
        onClick={onDetail}
        className="group block w-full p-6 text-left transition-colors duration-300 hover:bg-black/[0.015] active:scale-[0.995]"
        aria-label={`${title} 상세보기`}
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${bg} ${color}`}>
            {icon}
          </span>
          <span className="font-medium">{title}</span>
          {summary && (
            <span className={`ml-auto font-display font-semibold tabular ${pnlTone(summary.returnRate)}`}>
              {formatPercent(summary.returnRate)}
            </span>
          )}
        </div>
        {summary ? (
          <>
            <p className="mt-4 font-display text-2xl font-semibold tabular">
              {formatManEok(summary.totalValue)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
              <Row label="현금" value={formatKRW(Math.round(summary.cashBalance))} />
              <Row label="평가손익" value={signed(summary.unrealizedPnl)} tone={pnlTone(summary.unrealizedPnl)} />
              <Row label="실현손익" value={signed(summary.realizedPnl)} tone={pnlTone(summary.realizedPnl)} />
              <Row label="투자원금" value={formatManEok(summary.investedCapital)} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">계좌 정보를 불러올 수 없습니다.</p>
        )}
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand opacity-70 transition-all duration-300 group-hover:gap-1.5 group-hover:opacity-100">
          상세보기
          <ArrowUpRight width={13} height={13} />
        </span>
      </button>
    </Card>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between pr-3">
      <span className="text-muted">{label}</span>
      <span className={`tabular ${tone ?? 'text-ink'}`}>{value}</span>
    </div>
  )
}
