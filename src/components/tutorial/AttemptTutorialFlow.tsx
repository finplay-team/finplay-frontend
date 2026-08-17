// 영속 attempt를 정본으로 종목 선택부터 완료 replay까지 단일 차트 실습 흐름을 제공하는 컴포넌트
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CandleChart } from '../CandleChart'
import { Button, LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CandleGuide } from './CandleGuide'
import { SpotlightTour } from './SpotlightTour'
import type { SpotlightStep } from './SpotlightTour'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { formatDateTime, parseLocalDateTime, ratioToPercent } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW, formatPercent } from '../../lib/format'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import { cancelLimitOrder, getPendingOrders, placeLimitOrder, placeOrder } from '../../services/orderService'
import {
  getPracticeAttemptChart,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeHoldingReflectionResponse,
  PracticeSellVerdict,
  PracticeTradeResultResponse,
  PracticeTutorialChartResponse,
} from '../../services/tutorialTypes'
import type { Candle, Instrument, LimitOrderResponse, Market } from '../../services/types'

const TICK_MS = 3000
const REFLECTION_MAX = 2000
/**
 * 관찰을 몇 번의 tick마다 반복할지. tick이 3초이므로 약 6초에 한 번이다.
 *
 * 서버가 evidence로 인정하는 조건은 (A) 손절·익절선에 더 가까워진 순간의 관찰 1회이거나
 * (B) 최소 2분 범위에 걸친 관찰 3회다. 매수 직후 한 번만 기록하면 B는 구조적으로 불가능하고
 * A는 가격 운에 달려, 실제로 튜토리얼이 완료 불가 상태로 막히는 것을 프로덕션에서 재현했다.
 * 그래서 evidence가 붙을 때까지(observed) 주기적으로 계속 기록한다.
 */
const OBSERVE_EVERY_N_TICKS = 2
/** 이 시간 이하로 남으면 카운트다운을 경고색으로 바꾼다. */
const SALE_URGENT_MS = 60_000
/**
 * 서버가 매수 체결가에서 손절·익절선을 만들 때 쓰는 비율. 서버 TUTORIAL-FLOW-008과 같은 값이며
 * **서버가 바뀌면 여기도 바뀌어야 한다** — 매수 전 어림 계산이 매수 후 서버 확정값과 어긋나면
 * 사용자는 화면이 거짓말을 했다고 느낀다.
 */
const STOP_LOSS_RATE = -0.03
const TAKE_PROFIT_RATE = 0.05
type TutorialOrderType = 'MARKET' | 'LIMIT'
/** 오류를 "그 오류를 낸 액션 바로 아래"에 그리기 위한 위치 표시. 페이지 맨 아래 한 곳에만 두면 아무도 못 본다. */
type ErrorScope = 'select' | 'buy' | 'sell' | 'pending' | 'observe' | 'reflection' | 'restart'
interface FlowError {
  scope: ErrorScope
  message: string
}

const chartSummaryId = 'tutorial-chart-summary'

/** 이 화면이 사용자에게 약속하는 4단계. 서버 chain의 단계 번호와는 별개다(아래 uiStep 주석 참고). */
const STEP_TITLES = ['고르기', '사기', '지켜보기', '팔고 돌아보기'] as const

const SELL_VERDICT_TEXT: Record<PracticeSellVerdict, string> = {
  ABOVE_TAKE_PROFIT: '익절선 위에서 파셨습니다.',
  BELOW_STOP_LOSS: '손절선 아래에서 파셨습니다.',
  BETWEEN_LINES: '두 선 사이에서 파셨습니다.',
}

const REFLECTION_CHIPS = [
  '값이 내려갈 때 불안했다',
  '정해둔 선보다 일찍 팔았다',
  '그냥 궁금해서 눌러봤다',
] as const

/**
 * 게임식 스포트라이트 안내. 화면이 3초마다 갱신되고 매도 제한 시간도 흐르므로 한 단계를 한 호흡에
 * 읽을 수 있게 짧게 쓴다. target 값은 아래 JSX의 data-tour 속성과 1:1로 대응한다.
 *
 * SpotlightTour는 최초 마운트에서만 유예 없이 즉시 앞으로 훑는다 — 1단계(instrument)가 종목 목록
 * 로딩 때문에 늦게 떠도 안전한 이유는 타이머가 아니라 **그 시점에 뒤 단계 대상이 DOM에 하나도 없다**는
 * 것 하나다(instrumentId가 null인 동안 차트 카드와 매수 카드를 아예 렌더하지 않는다). 로딩 중에
 * 차트·매수 카드의 스켈레톤을 미리 띄우도록 바꾸면 이 전제가 깨져 1단계가 통째로 건너뛰어진다.
 */
const TOUR_STEPS: SpotlightStep[] = [
  { target: 'instrument', title: '먼저 종목을 고릅니다', body: '연습용으로 만든 가상 종목이에요. 아무거나 골라도 괜찮습니다.' },
  { target: 'quantity', title: '몇 개 살지 정합니다', body: '바로 아래에 얼마가 드는지 나옵니다. 연습용 가짜 돈입니다.' },
  { target: 'buy', title: '여기를 누르면 삽니다', body: '산 값을 기준으로 팔 기준선 두 개가 자동으로 만들어집니다.' },
  { target: 'chart', title: '값은 3초마다 움직입니다', body: '맨 오른쪽 막대 하나가 오늘입니다. 오르내리는 걸 지켜보세요.' },
  { target: 'sell', title: '팔 때는 이 버튼입니다', body: '조금 지켜본 뒤에 눌립니다. 정해진 시간 안에 파는 연습이에요.' },
  { target: 'reflection', title: '마지막은 한 줄 기록', body: '왜 그렇게 했는지 적어 보세요. 정답도 점수도 없습니다.' },
]

/**
 * 종목 선택 화면과 완료 replay 화면에서 "왜 이 종목을 살 만한지" 감을 잡도록 보여주는 교육용 가상
 * 시나리오다. 실제 뉴스가 아니다 — 샌드박스 종목은 가상 종목이라 실제 뉴스가 존재할 수 없다. symbol별로
 * 고정된 문구이며 실행(run)마다 바뀌지 않는다. 040(이슈 #402)부터 완료 attempt도 재시작할 수 있어
 * replay 화면에 머물지 않고 종목 선택부터 다시 볼 수 있지만, 재시작하지 않고 완료 기록만 다시 보는
 * 사용자를 위해 replay 화면에서도 계속 노출한다.
 */
const INSTRUMENT_SCENARIOS: Record<string, string> = {
  SANDBOX_STK_1: '알파전자가 차세대 반도체 부품 양산 계약을 새로 체결했다는 소식이 전해졌습니다.',
  SANDBOX_STK_2: '베타바이오의 신약 후보물질이 임상 2상에서 긍정적인 결과를 얻었다는 소식입니다.',
  SANDBOX_STK_3: '감마에너지가 대규모 태양광 발전 프로젝트를 수주했다는 소식이 발표됐습니다.',
  SANDBOX_COIN_1: '알파코인이 주요 거래소에 추가 상장된다는 소식으로 주목받고 있습니다.',
  SANDBOX_COIN_2: '베타코인 개발팀이 신규 네트워크 업그레이드 로드맵을 공개했습니다.',
  SANDBOX_COIN_3: '감마코인이 대형 결제 플랫폼과 파트너십을 맺었다는 소식이 전해졌습니다.',
}

function latestEvidence(progress: InvestmentPracticeResponse): PracticeEvidenceResponse | null {
  return [...progress.steps]
    .reverse()
    .map((step) => step.evidence)
    .find(
      (evidence) =>
        evidence.holdingId !== null ||
        evidence.buyTradeId !== null ||
        evidence.buyQuantity !== null ||
        evidence.reflectionId !== null,
    ) ?? null
}

function toChartCandles(chart: PracticeTutorialChartResponse | null): Candle[] {
  if (!chart) return []
  return chart.candles.map((candle) => ({
    sourceTime: `${candle.date}T00:00:00`,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: 0,
    current: candle.current,
  }))
}

/** 비율 상수를 그대로 문구용 "-3%" / "+5%" 로 만든다. 숫자를 문구에 따로 적으면 비율이 바뀔 때 어긋난다. */
function rateLabel(rate: number): string {
  const percent = Number((rate * 100).toFixed(2))
  return `${percent > 0 ? '+' : ''}${percent}%`
}

const STOP_LOSS_LABEL = rateLabel(STOP_LOSS_RATE)
const TAKE_PROFIT_LABEL = rateLabel(TAKE_PROFIT_RATE)

/** "+216원" / "-1,200원". 원화는 소수가 없으므로 formatKRW의 반올림을 그대로 쓴다. */
function formatSignedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

/**
 * 2단계 완료 한 줄. 수량이 null 이면 개수를 아예 말하지 않는다 — `?? 0` 으로 메우면
 * "0개를 샀습니다"라는 **거짓 문장**이 된다. 0은 "모른다"가 아니라 "0개"라는 사실 주장이다.
 *
 * 실제로 서버가 이 상태를 만든다(실측): 완료한 시장을 재시작하면 attempt 는 IN_PROGRESS 인데
 * 진행 조회는 예전 완료 응답을 돌려줘서 buyQuantity·sellQuantity·remainingQuantity 가 전부
 * null 로 온다. 체결가와 손절·익절선은 정상이라 수량만 비어 있다.
 */
function buyDoneText(buyQuantity: number | null, entryPrice: number | null): string {
  if (entryPrice === null) return '2. 사기 완료'
  if (buyQuantity === null) return `2. 사기 완료 · ${formatKRW(entryPrice)}에 샀습니다`
  return `2. 사기 완료 · ${buyQuantity}개를 ${formatKRW(entryPrice)}에 샀습니다`
}

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** 액션이 낸 오류를 그 액션 바로 아래에 그린다 — 페이지 맨 아래 한 곳에만 두면 아무도 못 본다. */
function ErrorNote({ error, scope }: { error: FlowError | null; scope: ErrorScope }) {
  if (!error || error.scope !== scope) return null
  return <p className="mt-3 text-sm text-loss">{error.message}</p>
}

function StepRail({ current, tone }: { current: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs font-medium text-ink">
        4단계 중 {current}단계 · {STEP_TITLES[current - 1]}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {STEP_TITLES.map((title, index) => (
          <span
            key={title}
            className={`h-1.5 w-7 rounded-full ${index < current ? tone : 'bg-white/[0.08]'}`}
          />
        ))}
      </div>
    </div>
  )
}

/** 끝낸 단계를 DOM에서 지우지 않고 한 줄로 남긴다 — 방금 자기가 한 게 몇 번이었는지 확인시켜 준다. */
function DoneLine({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm text-muted">
      <span className="text-gain">✓</span> {text}
    </p>
  )
}

function SaleCountdown({ remainingMs }: { remainingMs: number }) {
  const urgent = remainingMs <= SALE_URGENT_MS
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${urgent ? 'border-loss/30 bg-loss/10 text-loss' : 'border-line bg-elevated/60 text-muted'}`}
    >
      <span className="tabular font-medium">{formatMmSs(remainingMs)}</span> 안에 파는 연습입니다.
      {urgent ? ' 이제 파는 게 좋습니다.' : ' 시간이 끝나면 이번 연습은 여기서 멈춥니다.'}
    </div>
  )
}

/**
 * 차트 옆 상시 텍스트 요약. 호버가 안 되는 모바일과 화면 읽기 도구를 함께 구제한다 —
 * CandleChart의 describedById로도 연결한다.
 */
function ChartSummary({
  latestPrice,
  high,
  low,
  dayCount,
  entryPrice,
  stopLossPrice,
  takeProfitPrice,
}: {
  latestPrice: number | null
  high: number | null
  low: number | null
  dayCount: number
  entryPrice: number | null
  stopLossPrice: number | null
  takeProfitPrice: number | null
}) {
  if (latestPrice === null) {
    return (
      <p id={chartSummaryId} className="mt-3 text-sm leading-relaxed text-muted">
        가격을 불러오는 중입니다.
      </p>
    )
  }

  if (entryPrice === null || stopLossPrice === null || takeProfitPrice === null) {
    return (
      <p id={chartSummaryId} className="mt-3 text-sm leading-relaxed text-muted">
        지금 가격은 {formatKRW(latestPrice)}입니다.
        {high !== null && low !== null &&
          ` 최근 ${dayCount}일 중 가장 높았던 값은 ${formatKRW(high)}, 가장 낮았던 값은 ${formatKRW(low)}입니다.`}
      </p>
    )
  }

  const fromEntry = entryPrice === 0 ? 0 : ((latestPrice - entryPrice) / entryPrice) * 100
  const toTakeProfit = ((takeProfitPrice - latestPrice) / latestPrice) * 100
  const toStopLoss = ((latestPrice - stopLossPrice) / latestPrice) * 100
  const entryPhrase =
    fromEntry > 0
      ? `${Math.abs(fromEntry).toFixed(1)}% 높습니다`
      : fromEntry < 0
        ? `${Math.abs(fromEntry).toFixed(1)}% 낮습니다`
        : '같습니다'

  return (
    <p id={chartSummaryId} className="mt-3 text-sm leading-relaxed text-muted">
      지금 가격은 {formatKRW(latestPrice)}으로, 산 값({formatKRW(entryPrice)})보다 {entryPhrase}.{' '}
      {toTakeProfit > 0
        ? `익절선(${formatKRW(takeProfitPrice)})까지 ${toTakeProfit.toFixed(1)}% 남았고, `
        : `익절선(${formatKRW(takeProfitPrice)})은 이미 지났고, `}
      {toStopLoss > 0
        ? `손절선(${formatKRW(stopLossPrice)})까지는 ${toStopLoss.toFixed(1)}% 남았습니다.`
        : `손절선(${formatKRW(stopLossPrice)})은 이미 지났습니다.`}
    </p>
  )
}

/** 매도 전 "지금 팔면 얼마". riskSnapshot.entryPrice와 차트 최신가만으로 계산한다. */
function LivePnl({
  entryPrice,
  latestPrice,
  quantity,
}: {
  entryPrice: number
  latestPrice: number
  quantity: number
}) {
  const diff = (latestPrice - entryPrice) * quantity
  const percent = entryPrice === 0 ? 0 : ((latestPrice - entryPrice) / entryPrice) * 100
  const tone = diff > 0 ? 'text-gain' : diff < 0 ? 'text-loss' : 'text-muted'
  return (
    <p className="text-sm text-muted">
      {quantity}개를 {formatKRW(entryPrice)}에 샀고 지금은 {formatKRW(latestPrice)}입니다. 지금 팔면{' '}
      <span className={`tabular font-medium ${tone}`}>
        {formatSignedKRW(diff)} ({formatPercent(percent)})
      </span>
      .
    </p>
  )
}

/**
 * 매도 후 실현 손익. tradeResult는 백엔드 PR 머지 전이라 운영 응답에 아직 없다 —
 * 없으면 이 블록 전체를 조용히 숨긴다(화면이 깨지면 안 된다).
 */
function TradeResultBlock({ result }: { result: PracticeTradeResultResponse }) {
  const pnl = result.realizedPnl
  const tone = pnl === null ? 'text-muted' : pnl > 0 ? 'text-gain' : pnl < 0 ? 'text-loss' : 'text-muted'
  return (
    <div className="rounded-2xl border border-line bg-elevated/60 p-4">
      <dl className="grid gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">산 값</dt>
          <dd className="mt-1 tabular text-sm text-ink">
            {result.buyPrice === null ? '-' : formatKRW(result.buyPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">판 값</dt>
          <dd className="mt-1 tabular text-sm text-ink">
            {result.sellPrice === null ? '-' : formatKRW(result.sellPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">번 돈 / 잃은 돈</dt>
          <dd className={`mt-1 tabular text-sm ${tone}`}>{pnl === null ? '-' : formatSignedKRW(pnl)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">수익률</dt>
          <dd className={`mt-1 tabular text-sm ${tone}`}>
            {result.returnRate === null ? '-' : formatPercent(ratioToPercent(result.returnRate))}
          </dd>
        </div>
      </dl>
      {result.sellVerdict !== null && (
        <p className="mt-3 text-sm text-muted">{SELL_VERDICT_TEXT[result.sellVerdict]}</p>
      )}
      {pnl !== null && pnl < 0 && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          잘못하신 게 아닙니다. 값이 오를지 내릴지는 아무도 미리 알 수 없고, 그래서 투자하는 사람은 모두
          손실을 겪습니다. 중요한 건 손실이 났느냐가 아니라 얼마나 크게 났느냐입니다.
        </p>
      )}
    </div>
  )
}

/**
 * 매수 전 미리보기. 아직 체결가가 없어 riskSnapshot이 없으므로 차트 최신가에서 뽑은 **어림값**이다 —
 * "지금 값이면"·"약"으로 확정값이 아님을 문구에 드러낸다. 실제 기준선은 체결 시점에 서버가 확정한다.
 * 수량이 비었거나 0 이하거나 현재가를 모르면 줄 자체를 렌더하지 않는다.
 */
function BuyRiskPreviewLine({ latestPrice, quantity }: { latestPrice: number | null; quantity: number }) {
  if (latestPrice === null || !(quantity > 0)) return null
  const stopLossPrice = latestPrice * (1 + STOP_LOSS_RATE)
  const takeProfitPrice = latestPrice * (1 + TAKE_PROFIT_RATE)
  const loss = (latestPrice - stopLossPrice) * quantity
  const gain = (takeProfitPrice - latestPrice) * quantity
  return (
    <p className="mt-1 text-sm text-muted">
      지금 값이면 손절선은 약 {formatKRW(stopLossPrice)}이고, 여기까지 떨어지면 약 {formatKRW(loss)}을 잃습니다.
      익절선은 약 {formatKRW(takeProfitPrice)}이고, 여기까지 오르면 약 {formatKRW(gain)}을 법니다. 수수료는 빼고
      계산한 값입니다.
    </p>
  )
}

/**
 * 지금 들고 있는 수량 기준으로 두 기준선에 닿았을 때의 금액. -3%가 자기 돈으로 얼마인지 감이 없는
 * 초보자를 위한 것이라, 여기서는 riskSnapshot의 서버 확정가를 그대로 써서 어림이 아니다.
 * 수량을 모르면(재시작 계정에서 실제로 null이 온다) 문장을 통째로 생략한다.
 */
function RiskAmountLine({
  risk,
  holdingQuantity,
}: {
  risk: NonNullable<PracticeAttemptResponse['riskSnapshot']>
  holdingQuantity: number | null
}) {
  if (holdingQuantity === null || holdingQuantity <= 0) return null
  const loss = (risk.entryPrice - risk.stopLossPrice) * holdingQuantity
  const gain = (risk.takeProfitPrice - risk.entryPrice) * holdingQuantity
  return (
    <p className="mt-4 text-sm leading-relaxed text-ink">
      지금 {holdingQuantity}개를 갖고 있으니, 손절선에 닿으면 약 {formatKRW(loss)}을 잃고 익절선에 닿으면 약{' '}
      {formatKRW(gain)}을 법니다. <span className="text-muted">수수료는 빼고 계산한 값입니다.</span>
    </p>
  )
}

function RiskEducationCard({
  attempt,
  holdingQuantity,
}: {
  attempt: PracticeAttemptResponse
  holdingQuantity: number | null
}) {
  const risk = attempt.riskSnapshot
  if (!risk) return null
  return (
    <Card accent={attempt.market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">내가 팔 기준선</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">내가 산 값</dt>
          <dd className="mt-1 tabular text-base text-ink">{formatKRW(risk.entryPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">더 떨어지면 파는 선 (손절, {STOP_LOSS_LABEL})</dt>
          <dd className="mt-1 tabular text-base text-loss">{formatKRW(risk.stopLossPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">더 오르면 파는 선 (익절, {TAKE_PROFIT_LABEL})</dt>
          <dd className="mt-1 tabular text-base text-gain">{formatKRW(risk.takeProfitPrice)}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
        <p className="text-ink">이 선에 닿아도 자동으로 팔리지는 않습니다. 팔지 말지는 직접 정하세요.</p>
        <p>
          <span className="font-medium text-ink">손절선</span>은 "여기까지 내려가면 더 버티지 않고
          팔겠다"고 미리 정해두는 값입니다. 손실을 확정하는 대신 더 큰 손실을 막는 행동입니다.{' '}
          <span className="font-medium text-ink">익절선</span>은 "여기까지 오르면 욕심내지 않고 팔겠다"고
          정해두는 값입니다.
        </p>
        <p>
          <span className="font-medium text-ink">왜 -3%와 +5%인가요.</span> 손실 쪽을 이익 쪽보다 좁게
          잡았습니다. 잃을 때는 작게 잃고 벌 때는 크게 번다는 뜻이고, 이렇게 하면 열 번 중 네 번만 맞아도
          전체로는 손해를 보지 않습니다. 숫자 자체가 정답인 건 아니지만 이 원칙은 어디서나 통합니다.
        </p>
        <p>처음 산 값으로 한 번 정해진 뒤에는 가격이 움직여도 바뀌지 않습니다.</p>
      </div>
      <RiskAmountLine risk={risk} holdingQuantity={holdingQuantity} />
    </Card>
  )
}

export function AttemptTutorialFlow({
  market,
  attempt,
  progress,
  onAttemptChange,
  onRefresh,
}: {
  market: Market
  attempt: PracticeAttemptResponse
  progress: InvestmentPracticeResponse
  onAttemptChange: (attempt: PracticeAttemptResponse) => void
  onRefresh: () => Promise<void>
}) {
  const replay = attempt.mode === 'REPLAY' || attempt.status === 'COMPLETED'
  const [chart, setChart] = useState<PracticeTutorialChartResponse | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [busyInstrumentId, setBusyInstrumentId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(market === 'STOCK' ? '1' : '1')
  const [flowError, setFlowError] = useState<FlowError | null>(null)
  const [buying, setBuying] = useState(false)
  const [buyOrderType, setBuyOrderType] = useState<TutorialOrderType>('MARKET')
  const [buyLimitPrice, setBuyLimitPrice] = useState('')
  const [observing, setObserving] = useState(false)
  const [observeFailed, setObserveFailed] = useState(false)
  const [observeRetryNonce, setObserveRetryNonce] = useState(0)
  const [selling, setSelling] = useState(false)
  const [sellOrderType, setSellOrderType] = useState<TutorialOrderType>('MARKET')
  const [sellLimitPrice, setSellLimitPrice] = useState('')
  const [pendingOrder, setPendingOrder] = useState<LimitOrderResponse | null>(null)
  const [cancellingPending, setCancellingPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [reflecting, setReflecting] = useState(false)
  const [savedReflection, setSavedReflection] = useState<PracticeHoldingReflectionResponse | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const buyNonceRef = useRef(0)
  const sellNonceRef = useRef(0)
  const autoObserveHoldingIdRef = useRef<number | null>(null)

  const evidence = useMemo(() => latestEvidence(progress), [progress])
  const holdingId = evidence?.holdingId ?? null
  const remainingQuantity = evidence?.remainingQuantity ?? null
  const fullySold =
    evidence?.buyQuantity !== null &&
    evidence?.buyQuantity !== undefined &&
    evidence.buyQuantity > 0 &&
    remainingQuantity !== null &&
    remainingQuantity <= 0
  const observed = progress.steps.some((step) => step.evidence.observationId !== null)
  const expired = progress.steps.find((step) => step.step === 4)?.status === 'EXPIRED'
  /**
   * evidence 없이 전량 매도돼 4단계가 잠긴 상태. tick 루프가 관찰을 계속 쌓아 스스로 풀려나므로
   * 화면이 멈춘 게 아니라는 걸 알려야 한다. holdingId가 없으면 관찰을 부를 대상 자체가 없어
   * 자동 복구가 불가능하니, 그때는 "기다리면 된다"고 말하지 않는다(오지 않을 일을 약속하지 않는다).
   */
  const recoveringObservation = fullySold && !observed && holdingId !== null
  const candles = useMemo(() => toChartCandles(chart), [chart])
  const latestPrice = chart && chart.candles.length > 0 ? chart.candles[chart.candles.length - 1].close : null
  const chartHigh = chart && chart.candles.length > 0 ? Math.max(...chart.candles.map((c) => c.high)) : null
  const chartLow = chart && chart.candles.length > 0 ? Math.min(...chart.candles.map((c) => c.low)) : null
  const tradeResult = evidence?.tradeResult ?? null
  const saleDeadlineAt = evidence?.saleDeadlineAt ?? null
  const scenario = selectedInstrument ? INSTRUMENT_SCENARIOS[selectedInstrument.symbol] : undefined

  /**
   * 이 화면이 사용자에게 보여 주는 4단계는 서버 chain의 단계 번호(progress.currentStep)와 대응하지
   * 않는다 — 서버 chain은 관심등록·매수의사까지 포함하지만 이 화면은 고르기·사기·지켜보기·팔고
   * 돌아보기로 다시 묶었다. 그래서 화면에 쓰는 번호는 attempt·evidence 상태에서 직접 만든다.
   */
  const uiStep =
    attempt.status === 'SELECTING_INSTRUMENT' ? 1 : !attempt.riskSnapshot ? 2 : !fullySold ? 3 : 4
  const railTone = market === 'CRYPTO' ? 'bg-coin' : 'bg-brand'

  const buyKey = useIdempotencyKey([
    attempt.attemptId,
    attempt.runNumber,
    'BUY',
    quantity,
    buyOrderType,
    buyLimitPrice,
    buyNonceRef.current,
  ])
  const sellKey = useIdempotencyKey([
    attempt.attemptId,
    attempt.runNumber,
    'SELL',
    remainingQuantity,
    sellOrderType,
    sellLimitPrice,
    sellNonceRef.current,
  ])
  const pendingOrderRef = useRef(pendingOrder)
  useEffect(() => {
    pendingOrderRef.current = pendingOrder
  }, [pendingOrder])

  // tick 루프가 매번 다시 구독되지 않도록, 반복 관찰 판단에 쓰는 값만 ref로 흘려보낸다.
  const observeStateRef = useRef({ holdingId, observed })
  useEffect(() => {
    observeStateRef.current = { holdingId, observed }
  }, [holdingId, observed])
  const ticksSinceObserveRef = useRef(0)

  const showError = useCallback((scope: ErrorScope, message: string) => {
    setFlowError({ scope, message })
  }, [])
  const clearError = useCallback(() => setFlowError(null), [])

  useEffect(() => {
    if (attempt.status !== 'SELECTING_INSTRUMENT') return
    let cancelled = false
    loadInstruments(market)
      .then((items) => {
        if (!cancelled) setInstruments(items.filter((item) => item.isTutorialSample && item.tradable))
      })
      .catch((error) => {
        if (!cancelled) showError('select', toUserMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [attempt.status, market, showError])

  // 고른 종목 이름은 완료 요약과 시나리오 문구에 필요하다 — replay뿐 아니라 진행 중에도 읽는다.
  useEffect(() => {
    if (attempt.instrumentId === null) {
      setSelectedInstrument(null)
      return
    }
    let cancelled = false
    ensureInstrumentCache()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setSelectedInstrument(getCachedInstrument(attempt.instrumentId as number) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [attempt.instrumentId])

  useEffect(() => {
    if (attempt.instrumentId === null) {
      setChart(null)
      setChartReady(false)
      return
    }
    let cancelled = false
    setChartReady(false)
    setChartError(null)
    getPracticeAttemptChart(market)
      .then((response) => {
        if (!cancelled) {
          setChart(response)
          setChartReady(true)
        }
      })
      .catch((error) => {
        if (!cancelled) setChartError(toUserMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [attempt.attemptId, attempt.instrumentId, attempt.runNumber, market])

  useEffect(() => {
    if (market !== 'CRYPTO' || replay || attempt.instrumentId === null) return
    let cancelled = false
    getPendingOrders({ market: 'CRYPTO', limit: 100 })
      .then((page) => {
        if (cancelled) return
        const found = page.content.find(
          (order) =>
            order.instrumentId === attempt.instrumentId &&
            order.orderType === 'LIMIT' &&
            order.practiceAttemptId === attempt.attemptId &&
            order.practiceAttemptRunNumber === attempt.runNumber,
        )
        if (!found || found.limitPrice === null) return
        setPendingOrder({
          ...found,
          market: 'CRYPTO',
          orderType: 'LIMIT',
          status: 'PENDING',
          limitPrice: found.limitPrice,
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [attempt.instrumentId, market, replay])

  // 매도 제한 시각이 있을 때만 초 단위로 다시 그린다 — 제한이 없으면 타이머 자체를 걸지 않는다.
  useEffect(() => {
    if (saleDeadlineAt === null || replay) return
    setNowMs(Date.now())
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [saleDeadlineAt, replay])

  const saleRemainingMs =
    saleDeadlineAt === null ? null : parseLocalDateTime(saleDeadlineAt).getTime() - nowMs

  useEffect(() => {
    if (replay || !chartReady || attempt.status !== 'IN_PROGRESS' || attempt.instrumentId === null) return
    let stopped = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      if (inFlight) return
      if (document.hidden) {
        if (!stopped) timer = setTimeout(poll, TICK_MS)
        return
      }
      inFlight = true
      try {
        const response = await tickPracticeAttempt(market)
        if (stopped) return
        setChart(response)
        setChartError(null)
        const pending = pendingOrderRef.current
        if (pending) {
          const page = await getPendingOrders({ market: 'CRYPTO', limit: 100 })
          if (!page.content.some((order) => order.orderId === pending.orderId)) {
            setPendingOrder(null)
          }
        }
        await onRefresh()
        // evidence가 붙을 때까지 관찰을 주기적으로 반복한다. 실패해도 화면을 오류로 덮지 않고
        // 다음 주기에 조용히 다시 시도한다.
        // **전량 매도한 뒤에도 멈추면 안 된다.** 백엔드 #423 수정으로 매도 후의 관찰도 정상 접수되고
        // evidence로 인정된다. evidence 없이 팔려 버린 사용자에게는 이 반복 기록이 **유일한 복구 경로**다 —
        // 관찰은 201로 성공하지만 evidenceType이 null이라, 조건 B(3회·2분 범위)를 채울 때까지 쌓아야
        // 4단계 잠금이 풀린다. fullySold로 막으면 사용자는 빠져나올 길 없이 갇힌다(프로덕션 재현).
        const state = observeStateRef.current
        ticksSinceObserveRef.current += 1
        if (
          !stopped &&
          !state.observed &&
          state.holdingId !== null &&
          ticksSinceObserveRef.current >= OBSERVE_EVERY_N_TICKS
        ) {
          ticksSinceObserveRef.current = 0
          try {
            await recordHoldingObservation(state.holdingId)
            if (stopped) return
            bumpTutorial()
            await onRefresh()
          } catch {
            // 다음 주기에 재시도한다.
          }
        }
      } catch (error) {
        if (!stopped) setChartError(toUserMessage(error))
      } finally {
        inFlight = false
        if (!stopped) timer = setTimeout(poll, TICK_MS)
      }
    }
    timer = setTimeout(poll, TICK_MS)
    const handleVisibilityChange = () => {
      if (!document.hidden && timer && !inFlight) {
        clearTimeout(timer)
        timer = setTimeout(poll, 0)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [attempt.instrumentId, attempt.runNumber, attempt.status, chartReady, market, onRefresh, replay])

  const handleSelect = useCallback(
    async (instrumentId: number) => {
      setBusyInstrumentId(instrumentId)
      clearError()
      try {
        const selected = await selectPracticeInstrument(market, instrumentId)
        onAttemptChange(selected)
        await onRefresh()
      } catch (error) {
        showError('select', toUserMessage(error))
      } finally {
        setBusyInstrumentId(null)
      }
    },
    [clearError, market, onAttemptChange, onRefresh, showError],
  )

  const handleRestartClick = useCallback(() => {
    setShowRestartConfirm(true)
  }, [])

  const handleRestartCancel = useCallback(() => {
    setShowRestartConfirm(false)
  }, [])

  const handleRestartConfirm = useCallback(async () => {
    // 040(이슈 #402)부터 완료(replay)된 attempt도 재시작할 수 있다 — 서버가 보상은
    // 사용자·market 조합당 최초 완료 1회만 지급하고 재완료 때는 지급하지 않는다.
    setRestarting(true)
    clearError()
    try {
      const restarted = await restartPracticeAttempt(market)
      setChart(null)
      setChartReady(false)
      setAnswer('')
      setQuantity('1')
      setSavedReflection(null)
      onAttemptChange(restarted)
      await onRefresh()
    } catch (error) {
      showError('restart', toUserMessage(error))
    } finally {
      setRestarting(false)
      setShowRestartConfirm(false)
    }
  }, [clearError, market, onAttemptChange, onRefresh, showError])

  const handleBuy = useCallback(async () => {
    if (attempt.instrumentId === null) return
    const parsed = Number(quantity)
    if (!(parsed > 0) || (market === 'STOCK' && !Number.isInteger(parsed))) {
      showError(
        'buy',
        market === 'STOCK' ? '주식은 1주 단위입니다. 1 이상의 정수로 적어 주세요.' : '몇 개 살지 적어 주세요.',
      )
      return
    }
    setBuying(true)
    clearError()
    try {
      if (buyOrderType === 'LIMIT') {
        const parsedLimit = Number(buyLimitPrice)
        if (market !== 'CRYPTO' || !(parsedLimit > 0)) {
          showError('buy', '얼마가 되면 살지 값을 적어 주세요.')
          return
        }
        const created = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: attempt.instrumentId,
            side: 'BUY',
            quantity,
            limitPrice: buyLimitPrice,
          },
          buyKey,
        )
        setPendingOrder(created)
        bumpTutorial()
        return
      }
      await placeOrder(
        {
          market,
          instrumentId: attempt.instrumentId,
          side: 'BUY',
          orderType: 'MARKET',
          quantity,
        },
        buyKey,
      )
      buyNonceRef.current += 1
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      showError('buy', toUserMessage(error))
    } finally {
      setBuying(false)
    }
  }, [attempt.instrumentId, buyKey, buyLimitPrice, buyOrderType, clearError, market, onRefresh, quantity, showError])

  // 매수 체결 직후 첫 관찰. 서버 evidence 체인이 아직 반영되기 전이라 첫 시도가 PRACTICE_STEP_LOCKED·
  // PRACTICE_EVIDENCE_MISSING으로 일시적으로 튕길 수 있다(실측, 2026-08-16 — 프로덕션에서 재현).
  // 그래서 실패해도 바로 포기하지 않고 짧게 쉬었다 자동으로 몇 번 더 시도한 뒤에만 재시도 버튼을 보여준다.
  // 여기서 끝이 아니라, 위 tick 루프가 evidence가 붙을 때까지 관찰을 계속 반복한다.
  useEffect(() => {
    if (replay || holdingId === null || observed) return
    if (autoObserveHoldingIdRef.current === holdingId) return
    autoObserveHoldingIdRef.current = holdingId
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const attemptObserve = (retriesLeft: number) => {
      setObserving(true)
      setObserveFailed(false)
      setFlowError(null)
      recordHoldingObservation(holdingId)
        .then(() => {
          if (cancelled) return
          bumpTutorial()
          return onRefresh().then(() => {
            if (!cancelled) setObserving(false)
          })
        })
        .catch((error) => {
          if (cancelled) return
          if (retriesLeft > 0) {
            retryTimer = setTimeout(() => attemptObserve(retriesLeft - 1), 1500)
            return
          }
          autoObserveHoldingIdRef.current = null
          setObserveFailed(true)
          setObserving(false)
          setFlowError({
            scope: 'observe',
            message: toUserMessage(error, {
              PRACTICE_EVIDENCE_MISSING: '가격을 지켜보려면 먼저 사기가 끝나 있어야 합니다. 화면을 새로고침해 진행 상황을 확인해 주세요.',
            }),
          })
        })
    }

    attemptObserve(2)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [replay, holdingId, observed, onRefresh, observeRetryNonce])

  const handleSell = useCallback(async () => {
    if (attempt.instrumentId === null || remainingQuantity === null || remainingQuantity <= 0) return
    setSelling(true)
    clearError()
    try {
      if (sellOrderType === 'LIMIT') {
        const parsedLimit = Number(sellLimitPrice)
        if (market !== 'CRYPTO' || !(parsedLimit > 0)) {
          showError('sell', '얼마가 되면 팔지 값을 적어 주세요.')
          return
        }
        const created = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: attempt.instrumentId,
            side: 'SELL',
            quantity: String(remainingQuantity),
            limitPrice: sellLimitPrice,
          },
          sellKey,
        )
        setPendingOrder(created)
        bumpTutorial()
        return
      }
      await placeOrder(
        {
          market,
          instrumentId: attempt.instrumentId,
          side: 'SELL',
          orderType: 'MARKET',
          quantity: String(remainingQuantity),
        },
        sellKey,
      )
      sellNonceRef.current += 1
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      showError('sell', toUserMessage(error))
    } finally {
      setSelling(false)
    }
  }, [attempt.instrumentId, clearError, market, onRefresh, remainingQuantity, sellKey, sellLimitPrice, sellOrderType, showError])

  const handleCancelPending = useCallback(async () => {
    if (!pendingOrder || cancellingPending) return
    setCancellingPending(true)
    clearError()
    try {
      await cancelLimitOrder(pendingOrder.orderId)
      setPendingOrder(null)
      await onRefresh()
    } catch (error) {
      showError('pending', toUserMessage(error))
    } finally {
      setCancellingPending(false)
    }
  }, [cancellingPending, clearError, onRefresh, pendingOrder, showError])

  /**
   * 지정가 대기 탈출로. 정한 값에 영영 안 닿아 연습이 멈추는 걸 막는다 —
   * 대기 주문을 취소하고 같은 수량을 지금 값으로 바로 체결한다.
   */
  const handleFillPendingNow = useCallback(async () => {
    if (!pendingOrder || cancellingPending || attempt.instrumentId === null) return
    const side = pendingOrder.side
    const orderQuantity = String(pendingOrder.quantity)
    setCancellingPending(true)
    clearError()
    try {
      await cancelLimitOrder(pendingOrder.orderId)
      setPendingOrder(null)
      await placeOrder(
        { market, instrumentId: attempt.instrumentId, side, orderType: 'MARKET', quantity: orderQuantity },
        side === 'BUY' ? buyKey : sellKey,
      )
      if (side === 'BUY') {
        buyNonceRef.current += 1
        setBuyOrderType('MARKET')
      } else {
        sellNonceRef.current += 1
        setSellOrderType('MARKET')
      }
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      showError('pending', toUserMessage(error))
    } finally {
      setCancellingPending(false)
    }
  }, [attempt.instrumentId, buyKey, cancellingPending, clearError, market, onRefresh, pendingOrder, sellKey, showError])

  const handleReflection = useCallback(async () => {
    const trimmed = answer.trim()
    if (holdingId === null || trimmed.length === 0 || trimmed.length > REFLECTION_MAX) return
    setReflecting(true)
    clearError()
    try {
      const saved = await saveHoldingReflection(holdingId, trimmed)
      setSavedReflection(saved)
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      showError(
        'reflection',
        toUserMessage(error, {
          PRACTICE_EVIDENCE_MISSING:
            '기록을 남기려면 파는 것까지 끝내고, 그전에 가격을 한 번 이상 지켜본 기록이 있어야 합니다. 아래 버튼으로 다시 시도해 주세요.',
        }),
      )
    } finally {
      setReflecting(false)
    }
  }, [answer, clearError, holdingId, onRefresh, showError])

  const retryObserve = useCallback(() => setObserveRetryNonce((n) => n + 1), [])

  const buyUnitPrice =
    buyOrderType === 'LIMIT' && Number(buyLimitPrice) > 0 ? Number(buyLimitPrice) : latestPrice
  const buyQuantityNumber = Number(quantity)

  return (
    <div className="space-y-5">
      <SpotlightTour active={!replay} storageKey={`finplay.tour.tutorial.${market}`} steps={TOUR_STEPS} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            {attempt.runNumber}번째 연습 · {replay ? '완료 기록 다시 보기' : '진행 중'}
          </p>
          <div className="mt-2">
            <StepRail current={uiStep} tone={railTone} />
          </div>
          <p className="mt-1 text-xs text-muted">새로고침해도 같은 연습과 가격 흐름이 이어집니다.</p>
        </div>
        <div>
          <Button type="button" size="sm" variant="ghost" disabled={restarting} onClick={handleRestartClick}>
            {restarting ? '정리하는 중…' : '처음부터 다시 시작'}
          </Button>
          <ErrorNote error={flowError} scope="restart" />
        </div>
      </div>

      {!replay && !expired && !fullySold && saleRemainingMs !== null && (
        <SaleCountdown remainingMs={saleRemainingMs} />
      )}

      {attempt.instrumentId !== null && (
        <div data-tour="chart">
          <Card innerClassName="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">최근 30일 가격 흐름</p>
                <p className="mt-1 text-xs text-muted">
                  막대 하나가 하루입니다. 왼쪽은 이미 끝난 날이고, 맨 오른쪽 하나가 지금 움직이는 오늘입니다.
                </p>
              </div>
              <p className="tabular text-sm text-ink">{latestPrice === null ? '불러오는 중…' : formatKRW(latestPrice)}</p>
            </div>
            <div className="mt-4">
              <CandleChart
                candles={candles}
                interval="1d"
                maxBars={30}
                height={260}
                showVolume={false}
                beginnerLabels
                describedById={chartSummaryId}
                emptyMessage="차트를 불러오는 중입니다."
                referenceLines={
                  attempt.riskSnapshot
                    ? [
                        { value: attempt.riskSnapshot.stopLossPrice, tone: 'loss', label: `손절 ${STOP_LOSS_LABEL}` },
                        { value: attempt.riskSnapshot.takeProfitPrice, tone: 'gain', label: `익절 ${TAKE_PROFIT_LABEL}` },
                      ]
                    : undefined
                }
              />
            </div>
            <ChartSummary
              latestPrice={latestPrice}
              high={chartHigh}
              low={chartLow}
              dayCount={chart?.candles.length ?? 0}
              entryPrice={attempt.riskSnapshot?.entryPrice ?? null}
              stopLossPrice={attempt.riskSnapshot?.stopLossPrice ?? null}
              takeProfitPrice={attempt.riskSnapshot?.takeProfitPrice ?? null}
            />
            <div className="mt-4">
              <CandleGuide />
            </div>
            {scenario && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink/70">교육용 가상 시나리오</span> {scenario}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              {replay
                ? '끝난 연습이라 화면만 볼 수 있어요. 여기서는 사고팔 수 없고 가격도 멈춰 있습니다.'
                : '3초마다 1분씩, 실제보다 빠르게 시간이 흐릅니다. 맨 오른쪽 막대 하나만 오르내립니다.'}
            </p>
            {chartError && <p className="mt-2 text-sm text-loss">{chartError}</p>}
          </Card>
        </div>
      )}

      <RiskEducationCard attempt={attempt} holdingQuantity={remainingQuantity} />

      {pendingOrder && !replay && (
        <Card innerClassName="p-5">
          <p className="text-sm font-medium text-ink">
            정한 값이 되기를 기다리는 중입니다 ({pendingOrder.side === 'BUY' ? '사기' : '팔기'}).
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {pendingOrder.quantity}개 · {formatKRW(pendingOrder.limitPrice)}
            {latestPrice !== null && ` — 지금 값은 ${formatKRW(latestPrice)}이라 ${formatKRW(Math.abs(pendingOrder.limitPrice - latestPrice))} 차이가 납니다.`}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            값이 여기까지 오지 않으면 끝까지 체결되지 않습니다. 기다리기 어렵다면 지금 값에 바로 하셔도 됩니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={cancellingPending}
              onClick={() => void handleFillPendingNow()}
            >
              {cancellingPending ? '처리하는 중…' : `기다리지 않고 지금 값에 ${pendingOrder.side === 'BUY' ? '사기' : '팔기'}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={cancellingPending}
              onClick={() => void handleCancelPending()}
            >
              {cancellingPending ? '취소하는 중…' : '지정가 주문 취소'}
            </Button>
          </div>
          <ErrorNote error={flowError} scope="pending" />
        </Card>
      )}

      {replay ? (
        <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-6">
          <p className="text-lg font-semibold text-ink">이 시장의 실습을 완료했습니다</p>
          {progress.rewardAmount !== null && (
            <p className="mt-2 text-sm leading-relaxed text-ink">
              축하합니다. 연습용 자금 {formatKRW(progress.rewardAmount)}이 계좌에 들어왔습니다.
            </p>
          )}
          {tradeResult && (
            <div className="mt-4">
              <TradeResultBlock result={tradeResult} />
            </div>
          )}
          {savedReflection && (
            <div className="mt-4 rounded-2xl border border-line bg-elevated/60 p-4">
              <p className="text-xs text-muted">{savedReflection.prompt}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{savedReflection.answer}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton to="/trade" withIcon>
              실전 거래 시작하기
            </LinkButton>
            <Button
              type="button"
              variant="ghost"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              다른 시장도 연습해 보기
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            실전에는 실제로 거래되는 종목이 있습니다. 여기서 연습한 종목은 가상이라 포트폴리오와 랭킹에는
            잡히지 않습니다. 다른 시장은 위쪽 주식·코인 탭에서 바꿀 수 있습니다.
          </p>
          {progress.rewardAmount !== null && (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              완료 보상은 이 시장에서 최초 1회만 지급됩니다. 재시작해 다시 완료해도 보상은 추가로
              지급되지 않습니다.
            </p>
          )}
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-muted">산 개수</dt><dd className="mt-1 tabular text-ink">{evidence?.buyQuantity ?? '-'}</dd></div>
            <div><dt className="text-xs text-muted">판 개수</dt><dd className="mt-1 tabular text-ink">{evidence?.sellQuantity ?? '-'}</dd></div>
            <div><dt className="text-xs text-muted">남은 개수</dt><dd className="mt-1 tabular text-ink">{evidence?.remainingQuantity ?? '-'}</dd></div>
          </dl>
          {progress.completedAt && <p className="mt-4 text-xs text-muted">완료 {formatDateTime(progress.completedAt)}</p>}
        </Card>
      ) : attempt.status === 'SELECTING_INSTRUMENT' ? (
        <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-6">
          <h2 className="text-lg font-semibold text-ink">1. 연습할 종목을 고릅니다</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            고르면 바로 가격이 움직이기 시작합니다. 실제 회사가 아니라 연습용으로 만든 가상 종목이에요.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {instruments.map((instrument, index) => (
              <button
                key={instrument.instrumentId}
                type="button"
                data-tour={index === 0 ? 'instrument' : undefined}
                disabled={busyInstrumentId !== null}
                onClick={() => void handleSelect(instrument.instrumentId)}
                className="rounded-2xl border border-line bg-elevated p-4 text-left transition hover:border-brand/50 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-ink">{instrument.name}</span>
                <span className="mt-1 block text-xs text-muted">{instrument.symbol}</span>
                {INSTRUMENT_SCENARIOS[instrument.symbol] && (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    <span className="font-medium text-ink/70">교육용 가상 시나리오</span>{' '}
                    {INSTRUMENT_SCENARIOS[instrument.symbol]}
                  </p>
                )}
              </button>
            ))}
          </div>
          <ErrorNote error={flowError} scope="select" />
        </Card>
      ) : expired ? (
        <div className="rounded-2xl border border-loss/30 bg-loss/10 p-4">
          <p className="text-sm leading-relaxed text-loss">
            시간이 끝나서 이번 연습은 여기까지입니다. 잘못하신 게 아니라 연습 시간이 정해져 있어서
            그렇습니다. 다시 해 보시겠어요?
          </p>
          <Button type="button" className="mt-3" size="sm" onClick={handleRestartClick}>
            다시 해 보기
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <DoneLine text={`1. 고르기 완료${selectedInstrument ? ` · ${selectedInstrument.name}` : ''}`} />

          {!attempt.riskSnapshot ? (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">2. 몇 개 살지 정하고 사 봅니다</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                사는 순간의 값을 기준으로 팔 기준선 두 개(손절 {STOP_LOSS_LABEL} · 익절 {TAKE_PROFIT_LABEL})가
                자동으로 만들어집니다.
                비율을 직접 입력할 필요는 없습니다.
              </p>
              {market === 'CRYPTO' && (
                <>
                  <div className="mt-4 flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                    {(['MARKET', 'LIMIT'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={buyOrderType === type}
                        onClick={() => setBuyOrderType(type)}
                        className={`flex-1 rounded-full px-4 py-2 text-sm ${buyOrderType === type ? 'bg-coin text-coin-ink' : 'text-muted'}`}
                      >
                        {type === 'MARKET' ? '시장가' : '지정가'}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    시장가는 지금 값에 바로 삽니다(처음이라면 이걸 추천합니다). 지정가는 원하는 값이 될
                    때까지 기다립니다.
                  </p>
                </>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-40 flex-1 text-xs text-muted">
                  몇 개 살까요{market === 'STOCK' ? ' (1주 단위)' : ''}
                  <input
                    value={quantity}
                    data-tour="quantity"
                    onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-brand"
                  />
                </label>
                {market === 'CRYPTO' && buyOrderType === 'LIMIT' && (
                  <label className="min-w-48 flex-1 text-xs text-muted">
                    지정가
                    <div className="mt-2 flex gap-2">
                      <input
                        value={buyLimitPrice}
                        onChange={(event) => setBuyLimitPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        className="min-w-0 flex-1 rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-coin"
                      />
                      <Button type="button" size="sm" variant="soft" disabled={latestPrice === null} onClick={() => setBuyLimitPrice(String(latestPrice ?? ''))}>
                        현재가
                      </Button>
                    </div>
                  </label>
                )}
                <Button type="button" data-tour="buy" disabled={buying || pendingOrder !== null} onClick={() => void handleBuy()}>
                  {buying ? '주문하는 중…' : buyOrderType === 'LIMIT' ? '정한 값에 주문 넣기' : '지금 값에 사기'}
                </Button>
              </div>
              {buyUnitPrice !== null && buyQuantityNumber > 0 && (
                <p className="mt-3 text-sm text-muted">
                  {quantity}개 × {formatKRW(buyUnitPrice)} = 약 {formatKRW(buyUnitPrice * buyQuantityNumber)} ·
                  연습용 가짜 돈입니다
                </p>
              )}
              <BuyRiskPreviewLine latestPrice={latestPrice} quantity={buyQuantityNumber} />
              <ErrorNote error={flowError} scope="buy" />
            </Card>
          ) : (
            <DoneLine text={buyDoneText(evidence?.buyQuantity ?? null, attempt.riskSnapshot.entryPrice)} />
          )}

          {attempt.riskSnapshot && !fullySold && (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">3. 값이 어디로 가는지 지켜봅니다</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                값이 두 기준선에 얼마나 가까워졌는지 차트로 확인하세요. 지켜본 기록은 자동으로 남습니다.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {observing && <span className="text-xs text-muted">기록하는 중…</span>}
                {observed && <span className="text-xs text-gain">확인 완료</span>}
              </div>
              {latestPrice !== null && remainingQuantity !== null && remainingQuantity > 0 && (
                <div className="mt-3">
                  <LivePnl
                    entryPrice={attempt.riskSnapshot.entryPrice}
                    latestPrice={latestPrice}
                    quantity={remainingQuantity}
                  />
                </div>
              )}
            </Card>
          )}
          {/*
            관찰이 인정되기 전에 "지켜보기 완료"라고 쓰면 거짓이다 — 실제로 4단계는 아직 잠겨 있다.
            evidence가 붙기 전까지는 완료가 아니라 진행 중으로 보여준다.
          */}
          {attempt.riskSnapshot && fullySold && observed && (
            <DoneLine text="3. 지켜보기 완료 · 값이 어떻게 움직이는지 확인했습니다" />
          )}
          {attempt.riskSnapshot && recoveringObservation && (
            <p className="rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm text-muted">
              3. 가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.
            </p>
          )}

          {attempt.riskSnapshot && (
            <Card innerClassName="p-5">
              <h2 className="text-base font-semibold text-ink">4. 팔고, 왜 그랬는지 적어 봅니다</h2>
              {!fullySold ? (
                <div className="mt-4 space-y-4">
                  {market === 'CRYPTO' && (
                    <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                      {(['MARKET', 'LIMIT'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={sellOrderType === type}
                          onClick={() => setSellOrderType(type)}
                          className={`flex-1 rounded-full px-4 py-2 text-sm ${sellOrderType === type ? 'bg-coin text-coin-ink' : 'text-muted'}`}
                        >
                          {type === 'MARKET' ? '시장가' : '지정가'}
                        </button>
                      ))}
                    </div>
                  )}
                  {market === 'CRYPTO' && sellOrderType === 'LIMIT' && (
                    <label className="block text-xs text-muted">
                      지정가
                      <div className="mt-2 flex gap-2">
                        <input
                          value={sellLimitPrice}
                          onChange={(event) => setSellLimitPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                          inputMode="decimal"
                          className="min-w-0 flex-1 rounded-2xl border border-line bg-elevated px-4 py-3 text-ink outline-none focus:border-coin"
                        />
                        <Button type="button" size="sm" variant="soft" disabled={latestPrice === null} onClick={() => setSellLimitPrice(String(latestPrice ?? ''))}>
                          현재가
                        </Button>
                      </div>
                    </label>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      data-tour="sell"
                      disabled={
                        selling ||
                        !observed ||
                        pendingOrder !== null ||
                        remainingQuantity === null ||
                        remainingQuantity <= 0
                      }
                      onClick={() => void handleSell()}
                    >
                      {selling
                        ? '주문하는 중…'
                        : remainingQuantity === null
                          // 수량을 모르는 상태다. 0으로 지어내지 않고 개수를 뺀다 — 버튼은 위에서 이미 잠긴다.
                          ? sellOrderType === 'LIMIT'
                            ? '가진 만큼 정한 값에 팔기'
                            : '가진 만큼 전부 팔기'
                          : sellOrderType === 'LIMIT'
                            ? `가진 ${remainingQuantity}개 정한 값에 팔기`
                            : `가진 ${remainingQuantity}개 전부 팔기`}
                    </Button>
                    {/*
                      잠긴 이유가 둘이면 하나만 말한다. 수량을 모르는 상태에서 "잠시 뒤 팔 수 있어요"는
                      영원히 오지 않을 일을 약속하는 거짓말이라, 그때는 관찰 안내를 밀어내고 실제 이유를 쓴다.
                    */}
                    {remainingQuantity === null ? (
                      <p className="text-xs text-muted">
                        지금 가진 수량을 불러오지 못했습니다. 잠시 뒤에도 그대로면 위의 "처음부터 다시 시작"으로
                        다시 해 주세요.
                      </p>
                    ) : (
                      !observed && (
                        <p className="text-xs text-muted">
                          가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.
                        </p>
                      )
                    )}
                  </div>
                  <ErrorNote error={flowError} scope="sell" />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {tradeResult ? (
                    <TradeResultBlock result={tradeResult} />
                  ) : (
                    <p className="text-sm text-muted">
                      산 개수 {evidence?.buyQuantity ?? '-'} · 판 개수 {evidence?.sellQuantity ?? '-'} · 남은 개수{' '}
                      {remainingQuantity ?? '-'}
                    </p>
                  )}
                  <div>
                    <label htmlFor="tutorial-reflection" className="block text-sm font-medium text-ink">
                      오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.
                    </label>
                    <textarea
                      id="tutorial-reflection"
                      data-tour="reflection"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      maxLength={REFLECTION_MAX}
                      rows={5}
                      className="mt-2 w-full resize-y rounded-2xl border border-line bg-elevated px-4 py-3 text-sm text-ink outline-none focus:border-brand"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {REFLECTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setAnswer(chip)}
                        className="rounded-full border border-line bg-elevated px-3 py-1.5 text-xs text-muted transition hover:border-brand/50 hover:text-ink"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    정답도 점수도 없고 누구에게도 공개되지 않습니다. 한 줄이면 충분합니다.
                  </p>
                  {/*
                    복구가 도는 동안은 저장을 눌러도 PRACTICE_EVIDENCE_MISSING으로 반드시 실패한다 —
                    실패 문구를 보여주느니 잠그고 이유를 말한다. 다만 holdingId가 없어 자동 복구가
                    불가능한 경우(recoveringObservation === false)에는 잠그지 않는다. 영원히 눌리지 않는
                    버튼보다는 오류 문구 안의 재시도 경로가 낫다.
                  */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      disabled={reflecting || answer.trim().length === 0 || recoveringObservation}
                      onClick={() => void handleReflection()}
                    >
                      {reflecting ? '완료하는 중…' : '적은 내용 저장하고 끝내기'}
                    </Button>
                    {recoveringObservation && (
                      <p className="text-xs text-muted">
                        가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.
                      </p>
                    )}
                  </div>
                  {flowError?.scope === 'reflection' && (
                    <div className="rounded-2xl border border-loss/30 bg-loss/10 p-3">
                      <p className="text-sm text-loss">{flowError.message}</p>
                      {!observed && (
                        <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={retryObserve}>
                          관찰 다시 시도
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/*
        전량 매도하면 3단계 카드가 사라진다 — 재시도 버튼을 그 안에 두면 오류가 시키는 행동을 할
        버튼이 화면에서 없어진다. 그래서 카드 밖에서 조건만 보고 항상 노출하고, 관찰 실패 메시지도
        버튼과 같은 자리에 둔다(복기 오류 안에도 같은 버튼이 있으므로 그때는 여기서 뺀다).
      */}
      {!replay && observeFailed && !observing && !observed && flowError?.scope !== 'reflection' && (
        <div className="rounded-2xl border border-loss/30 bg-loss/10 p-3">
          {flowError?.scope === 'observe' && <p className="mb-2 text-sm text-loss">{flowError.message}</p>}
          <Button type="button" variant="ghost" size="sm" onClick={retryObserve}>
            관찰 다시 시도
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showRestartConfirm}
        title="처음부터 다시 시작할까요?"
        message="지금 연습의 대기 주문과 가진 종목을 정리하고 종목 고르기부터 다시 시작합니다."
        confirmLabel="다시 시작"
        busy={restarting}
        onConfirm={() => void handleRestartConfirm()}
        onCancel={handleRestartCancel}
      />
    </div>
  )
}
