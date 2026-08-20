// 영속 attempt를 정본으로 종목 선택부터 완료 replay까지 단일 차트 실습 흐름을 제공하는 컴포넌트
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { CandleChart } from '../CandleChart'
import { Button, LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CandleGuide } from './CandleGuide'
import { CompletionCelebration, completionTitle, rewardSentenceParts } from './CompletionCelebration'
import { EntryComparison, PRESET_LABEL } from './EntryComparison'
import { BreakingNewsCrawl } from './BreakingNewsCrawl'
import { ScenarioEventFeed, ScenarioStatusLine } from './ScenarioEventPanel'
import { OrderTypeGuideButton, OrderTypeGuideDialog } from './OrderTypeGuide'
import { SpotlightTour } from './SpotlightTour'
import type { SpotlightStep } from './SpotlightTour'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { formatDateTime, parseLocalDateTime, ratioToPercent } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { formatKRW, formatPercent, formatSignedKRW } from '../../lib/format'
import { CRYPTO_QTY_DECIMALS, presetQuantity } from '../../lib/quantity'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import {
  amendLimitOrder,
  cancelLimitOrder,
  placeLimitOrder,
  placeOrder,
} from '../../services/orderService'
import {
  getPracticeAttemptChart,
  getPracticeAttemptOrders,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectExitPreset,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeExitPreset,
  PracticeExitPresetOption,
  PracticeHoldingReflectionResponse,
  PracticeSellVerdict,
  PracticeTradeResultResponse,
  PracticeTutorialChartResponse,
} from '../../services/tutorialTypes'
import type { Candle, Instrument, LimitOrderResponse, Market, OrderSide } from '../../services/types'

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
type TutorialOrderType = 'MARKET' | 'LIMIT'
/** 오류를 "그 오류를 낸 액션 바로 아래"에 그리기 위한 위치 표시. 페이지 맨 아래 한 곳에만 두면 아무도 못 본다. */
type ErrorScope = 'select' | 'buy' | 'sell' | 'pending' | 'observe' | 'reflection' | 'restart' | 'preset'
interface FlowError {
  scope: ErrorScope
  message: string
}

const chartSummaryId = 'tutorial-chart-summary'

/** 이 화면이 사용자에게 약속하는 4단계. 서버 chain의 단계 번호와는 별개다(아래 uiStep 주석 참고). */
const STEP_TITLES = ['고르기', '구매하기', '지켜보기', '판매하고 돌아보기'] as const

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
 * 게임식 스포트라이트 안내. 화면이 3초마다 갱신되므로 한 단계를 한 호흡에
 * 읽을 수 있게 짧게 쓴다. target 값은 아래 JSX의 data-tour 속성과 1:1로 대응한다.
 *
 * SpotlightTour는 최초 마운트에서만 유예 없이 즉시 앞으로 훑는다 — 1단계(instrument)가 종목 목록
 * 로딩 때문에 늦게 떠도 안전한 이유는 타이머가 아니라 **그 시점에 뒤 단계 대상이 DOM에 하나도 없다**는
 * 것 하나다(instrumentId가 null인 동안 차트 카드와 매수 카드를 아예 렌더하지 않는다). 로딩 중에
 * 차트·매수 카드의 스켈레톤을 미리 띄우도록 바꾸면 이 전제가 깨져 1단계가 통째로 건너뛰어진다.
 */
const TOUR_INSTRUMENT: SpotlightStep = {
  target: 'instrument',
  title: '먼저 종목을 고릅니다',
  body: '연습용으로 만든 가상 종목이에요. 아무거나 골라도 괜찮습니다.',
}
/** 코인은 금액으로, 주식은 수량으로 산다 — 같은 자리를 가리키지만 부르는 말이 다르다. */
function tourQuantity(market: Market): SpotlightStep {
  return market === 'CRYPTO'
    ? {
        target: 'quantity',
        title: '얼마어치 구매할지 정합니다',
        body: '바로 아래에 몇 개를 사게 되는지 나옵니다. 연습용 가짜 돈입니다.',
      }
    : {
        target: 'quantity',
        title: '몇 개 구매할지 정합니다',
        body: '바로 아래에 얼마가 드는지 나옵니다. 연습용 가짜 돈입니다.',
      }
}
/** 지정가 토글은 코인 시장에만 있다 — 주식에서는 이 단계를 배열에서 뺀다. */
const TOUR_LIMIT: SpotlightStep = {
  target: 'order-type',
  title: '지금 구매할지, 값을 정해 둘지',
  body: '시장가는 지금 값에 바로 구매합니다. 지정가는 정한 값이 될 때까지 기다립니다.',
}
const TOUR_BUY: SpotlightStep = {
  target: 'buy',
  title: '여기를 누르면 구매합니다(매수)',
  body: '산 값을 기준으로 팔 기준선 두 개가 자동으로 만들어집니다.',
}
const TOUR_CHART: SpotlightStep = {
  target: 'chart',
  title: '값은 3초마다 움직입니다',
  body: '맨 오른쪽 막대 하나가 오늘입니다. 오르내리는 걸 지켜보세요.',
}
/** 미체결 카드는 지정가 주문을 실제로 걸었을 때만 존재한다 — 없으면 배열에서 뺀다. */
const TOUR_PENDING: SpotlightStep = {
  target: 'pending',
  title: '예약해 둔 주문은 여기입니다',
  body: '정한 값이 되면 체결됩니다. 값을 고치거나 취소할 수 있어요.',
}
/**
 * 본문은 마감을 약속하지 않는다. 코인 대본에는 매도 마감이 없고(saleDeadlineAt=null),
 * 안내가 뜨는 시점은 매수 전이라 마감이 있는지조차 아직 모른다. 마감이 실제로 있는 경우에는
 * SaleCountdown 이 따로 말해 준다.
 */
const TOUR_SELL: SpotlightStep = {
  target: 'sell',
  title: '판매할 때는 이 버튼입니다(매도)',
  body: '조금 지켜본 뒤에 눌립니다. 언제 팔지 직접 정해 보는 연습이에요.',
}
const TOUR_REFLECTION: SpotlightStep = {
  target: 'reflection',
  title: '마지막은 한 줄 기록',
  body: '왜 그렇게 했는지 적어 보세요. 정답도 점수도 없습니다.',
}

/**
 * 지금 화면에 실제로 존재할 수 있는 단계만 남긴 안내 배열.
 *
 * SpotlightTour는 대상이 없는 단계를 건너뛰지만 단계에 들어선 뒤 1초를 기다린다. 주식에는 지정가
 * 토글이 아예 없고 미체결 카드는 지정가 주문을 걸어야만 생기므로, 그대로 두면 대부분의 사용자가
 * 오지 않을 대상을 기다리며 안내가 멈춘 것처럼 보인다. 그래서 없을 것이 확실한 단계는 배열에서 뺀다.
 */
function buildTourSteps(market: Market, hasPendingOrder: boolean): SpotlightStep[] {
  // 순서는 카드 안에서 눈에 보이는 순서를 따른다 — 토글이 수량 입력 위에 있다.
  const steps: SpotlightStep[] = [TOUR_INSTRUMENT]
  if (market === 'CRYPTO') steps.push(TOUR_LIMIT)
  steps.push(tourQuantity(market), TOUR_BUY, TOUR_CHART)
  if (hasPendingOrder) steps.push(TOUR_PENDING)
  steps.push(TOUR_SELL, TOUR_REFLECTION)
  return steps
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

/**
 * 프리셋의 손절·익절 비율(퍼센트 크기, 3%는 `3`)을 문구용 "-3%" / "+5%" 로 만든다. 서버가 부호 없는
 * 크기만 주므로(부호는 이름으로만 정해진다 — 042 EXITPRESET-006) 여기서 손절엔 −, 익절엔 +를 붙인다.
 */
function presetRateLabels(option: { stopLossRate: number; takeProfitRate: number }): {
  stopLoss: string
  takeProfit: string
} {
  return { stopLoss: `-${option.stopLossRate}%`, takeProfit: `+${option.takeProfitRate}%` }
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
  if (entryPrice === null) return '2. 구매 완료'
  if (buyQuantity === null) return `2. 구매 완료 · ${formatKRW(entryPrice)}에 샀습니다`
  return `2. 구매 완료 · ${buyQuantity}개를 ${formatKRW(entryPrice)}에 샀습니다`
}

/**
 * 지정가 입력에 넣을 때 남길 소수 자리수. 코인이 소수점 주문을 지원한다는 것과 사용자가 9,699.786원에
 * 걸고 싶어 한다는 것은 전혀 다른 이야기라, 가격대별로 의미 있는 자리까지만 남긴다.
 * 1,000원 이상이면 1원 미만이 0.1%도 되지 않아 버리고, 값이 작을수록 자리를 늘린다.
 */
function decimalsForPrice(price: number): number {
  if (price >= 1000) return 0
  if (price >= 100) return 1
  return 2
}

/** 소수 자리를 정리한 뒤 불필요한 0을 떼어 입력창에 넣을 문자열로 만든다. */
function trimNumber(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)))
}

function toPriceInputValue(price: number): string {
  return trimNumber(price, decimalsForPrice(price))
}

/**
 * 올리기·내리기 결과는 가격대가 아니라 **폭 자체의 해상도**로 자른다. 가격대 기준으로 자르면 폭이
 * 0.002원인 저가 코인에서 결과가 0으로 잘려 나가 주문할 수 없는 값이 된다.
 */
function decimalsForStep(step: number): number {
  if (step >= 1) return 0
  return Math.min(8, Math.ceil(-Math.log10(step)))
}

/**
 * 올리기·내리기 한 번에 움직이는 폭. **현재가의 약 0.5%를 1·2·5 × 10ⁿ 중 가까운 값으로 스냅한다.**
 *
 * 고정 1,000원으로 잡으면 1만원대 종목에서 한 번에 10%가 움직인다 — 이 화면의 손절선(-3%)·익절선(+5%)을
 * 한 번에 뛰어넘는 폭이라 기준선 근처에 값을 걸 수가 없다. 반대로 너무 잘게 잡으면 몇십 번을 눌러야 한다.
 * 0.5%면 손절선까지 6번, 익절선까지 10번이라 두 기준선을 손으로 겨냥할 수 있다.
 */
function limitPriceStep(price: number): number {
  const raw = price * 0.005
  if (!(raw > 0)) return 1
  const base = Math.pow(10, Math.floor(Math.log10(raw)))
  const normalized = raw / base
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10
  return factor * base
}

/** 폭 자체를 문구로 쓸 때. formatKRW는 반올림해서 0.5원 같은 폭을 "1원"으로 만들어 버린다. */
function formatStep(step: number): string {
  return `${Number(step.toFixed(4))}원`
}

/** 입력한 지정가가 지금 값보다 얼마나 위/아래인지. 값이 없거나 현재가를 모르면 아무 말도 하지 않는다. */
function limitGapText(value: string, latestPrice: number | null): string | null {
  const parsed = Number(value)
  if (latestPrice === null || !(latestPrice > 0) || !(parsed > 0)) return null
  const percent = ((parsed - latestPrice) / latestPrice) * 100
  if (Math.abs(percent) < 0.05) return '지금 값과 거의 같습니다.'
  return `지금 값보다 ${Math.abs(percent).toFixed(1)}% ${percent > 0 ? '높습니다' : '낮습니다'}.`
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

/** 값이 바뀐 걸 알아볼 만큼만 색을 남긴다. 3초마다 갱신되므로 이보다 길면 계속 깜빡이는 것처럼 보인다. */
const PRICE_FLASH_MS = 800

/**
 * 주문 카드 안의 현재가. 지금까지는 주문 카드에 "1개 × 10,567원"만 있어서, 그게 지금 값인지 확인하려면
 * 차트까지 스크롤을 올려야 했다. 값은 차트와 같은 latestPrice 하나에서 나오므로 두 곳이 어긋나지 않는다.
 */
function CurrentPriceBox({ price, note }: { price: number | null; note: string }) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const previousRef = useRef<number | null>(null)

  useEffect(() => {
    if (price === null) return
    const previous = previousRef.current
    previousRef.current = price
    if (previous === null || previous === price) return
    setFlash(price > previous ? 'up' : 'down')
    const timer = setTimeout(() => setFlash(null), PRICE_FLASH_MS)
    return () => clearTimeout(timer)
  }, [price])

  const tone = flash === 'up' ? 'text-gain' : flash === 'down' ? 'text-loss' : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-elevated/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted">지금 값</p>
        <p className={`tabular text-2xl font-semibold transition-colors duration-300 ${tone}`}>
          {price === null ? '불러오는 중…' : formatKRW(price)}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </div>
  )
}

/**
 * 지정가 입력 한 벌 — 올리기·내리기·현재가 채우기까지 묶는다.
 *
 * 올리기·내리기는 현재값에 폭을 더하는 게 아니라 **폭의 배수(격자)로 옮긴다.** 9,699.786에서 한 번
 * 올렸을 때 9,749.786이 되면 소수점을 정리한 의미가 없어지기 때문이다. 0 이하로는 내려가지 않는다.
 */
function LimitPriceField({
  id,
  label,
  value,
  onChange,
  latestPrice,
}: {
  /**
   * label을 input에 htmlFor로 묶는다. 감싸는 label 안에 버튼을 두면 **버튼도 labelable 요소라**
   * 라벨이 입력창이 아니라 첫 버튼에 붙는다 — 화면 읽기 도구에 지정가 입력이 이름 없이 노출된다.
   */
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  latestPrice: number | null
}) {
  const parsed = Number(value)
  const basePrice = parsed > 0 ? parsed : latestPrice
  const step = basePrice === null || !(basePrice > 0) ? null : limitPriceStep(basePrice)
  const gap = limitGapText(value, latestPrice)

  const move = (direction: 1 | -1) => {
    if (basePrice === null || step === null) return
    const next =
      direction > 0
        ? (Math.floor(basePrice / step) + 1) * step
        : Math.max(step, (Math.ceil(basePrice / step) - 1) * step)
    onChange(trimNumber(next, decimalsForStep(step)))
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs text-muted">
        {label}
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`${label} 내리기`}
          disabled={step === null}
          onClick={() => move(-1)}
        >
          −
        </Button>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-elevated px-4 py-3 tabular text-ink outline-none focus:border-coin"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`${label} 올리기`}
          disabled={step === null}
          onClick={() => move(1)}
        >
          +
        </Button>
        <Button
          type="button"
          size="sm"
          variant="soft"
          disabled={latestPrice === null}
          onClick={() => onChange(latestPrice === null ? '' : toPriceInputValue(latestPrice))}
        >
          현재가
        </Button>
      </div>
      {(gap || step !== null) && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {gap}
          {gap && step !== null ? ' ' : ''}
          {step !== null && `올리기·내리기는 ${formatStep(step)} 단위로 움직입니다.`}
        </p>
      )}
    </div>
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
 *
 * 비율은 지금 고른 프리셋(042)에서 온다 — 프리셋마다 손절·익절 폭이 다르므로 고정값이면 어림이 틀린다.
 */
function BuyRiskPreviewLine({
  latestPrice,
  quantity,
  stopLossRate,
  takeProfitRate,
}: {
  latestPrice: number | null
  quantity: number
  stopLossRate: number
  takeProfitRate: number
}) {
  if (latestPrice === null || !(quantity > 0)) return null
  const stopLossPrice = latestPrice * (1 - stopLossRate / 100)
  const takeProfitPrice = latestPrice * (1 + takeProfitRate / 100)
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

/**
 * 매수 전 손절·익절 프리셋 선택(042, 이슈 #477). 조심스럽게·보통·느긋하게 세 개를 나란히 놓고,
 * 고른 프리셋의 실제 비율을 버튼 안에 함께 적어 "폭이 다르다"는 게 눈에 보이게 한다.
 *
 * 매수 전에는 서버가 늘 잠그지 않은 상태(exitPresetLocked=false)로 응답한다 — 잠금은 "지금 보유
 * 중인가"를 기준으로 하고, 이 자리는 아직 아무것도 사지 않은 시점이기 때문이다. `locked`는 그래도
 * 서버 값을 그대로 받아 방어적으로 반영한다.
 */
function ExitPresetPicker({
  options,
  selected,
  locked,
  saving,
  activeClassName,
  onSelect,
}: {
  options: PracticeExitPresetOption[]
  selected: PracticeExitPreset
  locked: boolean
  saving: boolean
  activeClassName: string
  onSelect: (preset: PracticeExitPreset) => void
}) {
  if (options.length === 0) return null
  return (
    <div data-tour="exit-preset">
      <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
        {options.map((option) => {
          const active = option.preset === selected
          const labels = presetRateLabels(option)
          return (
            <button
              key={option.preset}
              type="button"
              aria-pressed={active}
              disabled={locked || saving}
              onClick={() => onSelect(option.preset)}
              className={`flex-1 rounded-2xl px-3 py-2 text-center text-xs font-medium transition-all duration-400 ease-spring disabled:cursor-default disabled:opacity-50 ${
                active ? activeClassName : 'text-muted hover:text-ink'
              }`}
            >
              {PRESET_LABEL[option.preset]}
              <span className="mt-0.5 block text-[10px] tabular opacity-80">
                {labels.stopLoss} · {labels.takeProfit}
              </span>
            </button>
          )
        })}
      </div>
      {locked && (
        <p className="mt-1.5 text-[11px] text-muted">
          지금은 보유 중이라 바꿀 수 없습니다. 다 판 뒤에 다시 고르세요.
        </p>
      )}
    </div>
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
  const labels = presetRateLabels(risk)
  /**
   * "열 번 중 몇 번만 맞아도 전체로는 손해를 보지 않는다"의 손익분기 승률. 세 프리셋(2/3·3/5·5/8) 모두
   * 손실 쪽이 이익 쪽보다 좁아 반올림하면 공교롭게 네 번이지만, 프리셋이 바뀌어도 문구가 어긋나지
   * 않도록 실제 스냅샷 비율로 계산한다.
   */
  const breakevenOutOfTen = Math.round(
    (risk.stopLossRate / (risk.stopLossRate + risk.takeProfitRate)) * 10,
  )
  return (
    <Card accent={attempt.market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">내가 팔 기준선</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">내가 산 값</dt>
          <dd className="mt-1 tabular text-base text-ink">{formatKRW(risk.entryPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">더 떨어지면 파는 선 (손절, {labels.stopLoss})</dt>
          <dd className="mt-1 tabular text-base text-loss">{formatKRW(risk.stopLossPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">더 오르면 파는 선 (익절, {labels.takeProfit})</dt>
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
          <span className="font-medium text-ink">
            왜 {labels.stopLoss}와 {labels.takeProfit}인가요.
          </span>{' '}
          손실 쪽을 이익 쪽보다 좁게 잡았습니다. 잃을 때는 작게 잃고 벌 때는 크게 번다는 뜻이고, 이렇게
          하면 열 번 중 {breakevenOutOfTen}번만 맞아도 전체로는 손해를 보지 않습니다. 숫자 자체가 정답인
          건 아니지만 이 원칙은 어디서나 통합니다.
        </p>
        <p>처음 산 값으로 한 번 정해진 뒤에는 가격이 움직여도 바뀌지 않습니다.</p>
      </div>
      <RiskAmountLine risk={risk} holdingQuantity={holdingQuantity} />
    </Card>
  )
}

/**
 * 대기 카드가 사라진 뒤 남기는 결말. 튜토리얼 전용 주문 조회(435)는 상태 무관(PENDING·FILLED·CANCELLED)
 * 전부 오므로, tick마다 이 목록에서 그 orderId를 직접 찾아 PENDING 이면 카드를 유지하고 FILLED·CANCELLED면
 * 확정 상태를 남긴다. 목록에서 아예 찾지 못하면 UNKNOWN으로 두고 **추측하지 않는다** — 이 목록은 현재
 * attempt·run 귀속 주문만 오므로 정상적으로는 일어나지 않아야 하는 경우지만, 방어적으로 남겨 둔다.
 */
interface PendingOutcome {
  status: 'FILLED' | 'CANCELLED' | 'UNKNOWN'
  side: OrderSide
  quantity: number
  limitPrice: number
}

const sideVerb: Record<OrderSide, string> = { BUY: '구매', SELL: '판매' }

/**
 * 지정가는 체결가가 지정가로 고정되므로(services/types.ts의 OrderSummary.limitPrice 주석) 체결됐다면
 * 얼마에 됐는지를 단정해도 된다. 반대로 확인하지 못한 경우에는 체결됐다고도 안 됐다고도 말하지 않는다.
 */
function pendingOutcomeText(outcome: PendingOutcome): string {
  if (outcome.status === 'FILLED') {
    return `예약한 값에 체결됐습니다. ${outcome.quantity}개를 ${formatKRW(outcome.limitPrice)}에 ${sideVerb[outcome.side]}했습니다.`
  }
  if (outcome.status === 'CANCELLED') {
    return '예약을 취소했습니다. 체결되지 않았습니다.'
  }
  return '예약이 대기 목록에서 사라졌습니다. 체결됐는지 취소됐는지는 확인하지 못했습니다.'
}

/** 지금 값과 걸어둔 값의 관계로 "언제 체결되는지"를 말한다. 방향이 뒤집힌 경우를 지어내지 않는다. */
function pendingFillText(order: LimitOrderResponse, latestPrice: number | null): string {
  if (latestPrice === null) {
    return `지금 값이 ${formatKRW(order.limitPrice)}이 되면 그 값에 ${sideVerb[order.side]}됩니다.`
  }
  if (order.side === 'BUY') {
    return order.limitPrice < latestPrice
      ? `지금 값이 ${formatKRW(order.limitPrice)}까지 내려오면 그 값에 구매됩니다.`
      : '예약한 값이 지금 값보다 높습니다. 곧 체결될 수 있습니다.'
  }
  return order.limitPrice > latestPrice
    ? `지금 값이 ${formatKRW(order.limitPrice)}까지 올라가면 그 값에 판매됩니다.`
    : '예약한 값이 지금 값보다 낮습니다. 곧 체결될 수 있습니다.'
}

/**
 * 예약(미체결) 확인 카드. **주문을 건 그 자리에 그린다** — 예전에는 차트보다도 위에 있어서, 4단계에서
 * 판매를 예약하면 확인 카드가 화면 한참 위에 생기고 방금 누른 자리에서는 버튼이 조용히 잠기기만 했다.
 * 사용자는 예약이 걸리지 않았다고 판단했다(프로덕션 실측).
 *
 * data-tour="pending"은 스포트라이트 안내가 찾는 값이라 위치가 바뀌어도 그대로 유지한다.
 */
function PendingOrderCard({
  cardRef,
  order,
  latestPrice,
  error,
  busy,
  amendOpen,
  amendPrice,
  amendQuantity,
  amending,
  onFillNow,
  onAmendOpen,
  onAmendClose,
  onAmendSubmit,
  onAmendPriceChange,
  onAmendQuantityChange,
  onCancel,
}: {
  cardRef: RefObject<HTMLDivElement>
  order: LimitOrderResponse
  latestPrice: number | null
  error: FlowError | null
  busy: boolean
  amendOpen: boolean
  amendPrice: string
  amendQuantity: string
  amending: boolean
  onFillNow: () => void
  onAmendOpen: () => void
  onAmendClose: () => void
  onAmendSubmit: () => void
  onAmendPriceChange: (next: string) => void
  onAmendQuantityChange: (next: string) => void
  onCancel: () => void
}) {
  return (
    <div data-tour="pending" ref={cardRef}>
      <Card innerClassName="p-5">
        <p className="text-sm font-medium text-ink">
          정한 값이 되기를 기다리는 중입니다 ({order.side === 'BUY' ? '구매' : '판매'} 예약).
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">걸어둔 값</dt>
            <dd className="mt-1 tabular text-base text-ink">{formatKRW(order.limitPrice)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">지금 값</dt>
            <dd className="mt-1 tabular text-base text-ink">
              {latestPrice === null ? '불러오는 중…' : formatKRW(latestPrice)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">차이</dt>
            <dd className="mt-1 tabular text-base text-ink">
              {latestPrice === null
                ? '-'
                : `${formatSignedKRW(order.limitPrice - latestPrice)} (${formatPercent(
                    ((order.limitPrice - latestPrice) / latestPrice) * 100,
                  )})`}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {order.quantity}개를 예약해 뒀습니다. {pendingFillText(order, latestPrice)} 값이
          여기까지 오지 않으면 끝까지 체결되지 않습니다.
        </p>

        {!amendOpen ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={onFillNow}>
              {busy
                ? '처리하는 중…'
                : `기다리지 않고 지금 값에 ${order.side === 'BUY' ? '구매하기' : '판매하기'}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onAmendOpen}>
              예약 값 고치기
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              {busy ? '취소하는 중…' : '지정가 주문 취소'}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <LimitPriceField
              id="tutorial-amend-limit-price"
              label="바꿀 지정가"
              value={amendPrice}
              onChange={onAmendPriceChange}
              latestPrice={latestPrice}
            />
            <label className="block text-xs text-muted">
              바꿀 개수
              <input
                value={amendQuantity}
                onChange={(event) => onAmendQuantityChange(event.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                className="mt-2 w-full rounded-2xl border border-line bg-elevated px-4 py-3 tabular text-ink outline-none focus:border-coin"
              />
            </label>
            {/* 정정은 취소 후 재주문이 아니라 같은 주문을 고치는 것이라 주문 순서가 유지된다. */}
            <p className="text-[11px] leading-relaxed text-muted">
              같은 예약의 값과 개수를 고칩니다. 이전 값은 다시 조회할 수 없습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={amending} onClick={onAmendSubmit}>
                {amending ? '고치는 중…' : '이 값으로 고치기'}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={amending} onClick={onAmendClose}>
                되돌리기
              </Button>
            </div>
          </div>
        )}
        <ErrorNote error={error} scope="pending" />
      </Card>
    </div>
  )
}

/** 예약이 걸려 있어 주문 버튼이 잠겼을 때, 왜 눌리지 않는지 그 자리에서 알려 준다. */
function PendingBlocksOrderNote() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      바로 아래 예약해 둔 주문이 기다리는 중이라 지금은 새로 주문할 수 없어요. 예약을 취소하거나 지금 값에
      바로 처리하면 다시 누를 수 있습니다.
    </p>
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
  /**
   * 코인 시장가 매수의 "얼마어치" 입력. 모의투자 화면(pages/Trade.tsx)이 실제 빗썸처럼 금액으로 사고
   * 튜토리얼만 수량으로 사면, 여기서 익힌 조작이 실전에서 통하지 않는다. 서버 API는 여전히 수량만
   * 받으므로 이 값은 아래 effect에서 quantity로 환산해 넘긴다.
   */
  const [buyAmount, setBuyAmount] = useState('')
  const [flowError, setFlowError] = useState<FlowError | null>(null)
  const [buying, setBuying] = useState(false)
  const [presetSaving, setPresetSaving] = useState(false)
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
  const [amendOpen, setAmendOpen] = useState(false)
  const [amendPrice, setAmendPrice] = useState('')
  const [amendQuantity, setAmendQuantity] = useState('')
  const [amending, setAmending] = useState(false)
  /** 대기 카드가 사라진 이유를 사용자에게 남겨 두는 자리. 카드가 조용히 없어지면 팔렸는지 알 수 없다. */
  const [pendingOutcome, setPendingOutcome] = useState<PendingOutcome | null>(null)
  const [answer, setAnswer] = useState('')
  const [reflecting, setReflecting] = useState(false)
  const [savedReflection, setSavedReflection] = useState<PracticeHoldingReflectionResponse | null>(null)
  /**
   * 축하 모달은 **이번에 실제로 보상을 받은 순간의 응답**으로만 열린다. 어디에도 영속하지 않으므로
   * 새로고침·재진입에는 뜨지 않고, 재완료(rewardGranted=false)에도 뜨지 않는다.
   */
  const [celebrating, setCelebrating] = useState(false)
  /**
   * 완료 결과를 **다시** 여는 경로. 축하 모달과 같은 모달을 쓰되 "축하합니다"와 금액 세어 올리기 없이
   * 결과만 보여준다 — 다시 볼 때마다 축하하면 어색해진다(완료 카드와 같은 판단).
   */
  const [reviewingResult, setReviewingResult] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  /** 관찰 기록이 하나도 없는 상태에서 매도를 누르면 실제 매도 API를 부르기 전에 이 확인을 먼저 띄운다. */
  const [showSellNoObserveConfirm, setShowSellNoObserveConfirm] = useState(false)
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  /** 안내를 처음부터 다시 보여 주기 위해 SpotlightTour를 리마운트시키는 값. */
  const [tourNonce, setTourNonce] = useState(0)
  const [orderTypeGuideOpen, setOrderTypeGuideOpen] = useState(false)
  /** 비활성 "예약 매도" 탭이 가리키는 설명 문구의 id — 스크린리더가 왜 못 누르는지 함께 읽는다. */
  const reservedSellNoteId = useId()
  /**
   * 주문 패널 탭. 모의투자 화면(pages/Trade.tsx)의 "주문 | 커뮤니티" 자리에 튜토리얼은
   * "주문 | 되돌아보기"를 둔다.
   */
  const [panelTab, setPanelTab] = useState<'order' | 'review'>('order')
  /** 예약을 새로 건 순간을 세어 두고, 그 뒤 렌더에서 예약 카드를 화면 안으로 스크롤한다. */
  const [pendingCreatedNonce, setPendingCreatedNonce] = useState(0)
  const pendingCardRef = useRef<HTMLDivElement>(null)
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
   * 4단계(매도) 잠금은 더 이상 관찰 여부로 프론트가 계산하지 않는다 — 서버(백엔드 #429)가
   * 관찰과 무관하게 매수 직후 5분 창 안에서 곧바로 매도를 열어 두도록 바뀌었으므로, 서버가 내려주는
   * steps[3].locked를 그대로 따른다. 이 화면은 항상 샘플 종목(4단계) chain만 다루므로 평소에는
   * 반드시 존재하지만, 혹시 없을 때는 안전하게 잠근 것으로 본다.
   */
  const sellLocked = progress.steps.find((step) => step.step === 4)?.locked ?? true
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
  /**
   * 대본을 쓰지 않는 실행(주식 튜토리얼·완료 replay)은 서버가 scenarioStage를 null로 준다 —
   * **이 값으로 "대본 UI 없음"을 판정한다**(계약 명시). null이면 사건 패널을 아예 그리지 않는다.
   */
  const scenarioStage = chart?.scenarioStage ?? null
  /** 진행 조회의 사건 목록은 완료 후에도 남는다 — 차트가 없는 순간에도 결과 모달이 쓸 수 있다. */
  const revealedEvents =
    chart !== null && chart.revealedEvents.length > 0 ? chart.revealedEvents : progress.revealedEvents
  const saleDeadlineAt = evidence?.saleDeadlineAt ?? null

  /**
   * 이 화면이 사용자에게 보여 주는 4단계는 서버 chain의 단계 번호(progress.currentStep)와 대응하지
   * 않는다 — 서버 chain은 관심등록·매수의사까지 포함하지만 이 화면은 고르기·구매하기·지켜보기·
   * 판매하고 돌아보기로 다시 묶었다. 그래서 화면에 쓰는 번호는 attempt·evidence 상태에서 직접 만든다.
   */
  const uiStep =
    attempt.status === 'SELECTING_INSTRUMENT' ? 1 : !attempt.riskSnapshot ? 2 : !fullySold ? 3 : 4
  const railTone = market === 'CRYPTO' ? 'bg-coin' : 'bg-brand'
  const rewardSentence = rewardSentenceParts(market)

  /** 코인 시장가 매수만 금액 입력이다 — 지정가는 값을 직접 정하는 자리라 수량 입력을 그대로 쓴다. */
  const amountMode = market === 'CRYPTO' && buyOrderType === 'MARKET'
  const buyAmountNumber = buyAmount === '' ? 0 : Number(buyAmount)
  /**
   * 금액 입력을 실제 주문 수량으로 환산한다 — 서버 API는 수량만 받는다. **매수 수수료를 빼고
   * 나눈다**: 현금을 가격으로만 나누면 서버가 amount + fee 만큼 깎을 때 잔고를 넘겨
   * INSUFFICIENT_CASH가 난다(lib/quantity 주석).
   *
   * state를 덮어쓰지 않고 파생값으로 둔다 — setQuantity로 밀어 넣으면 금액이 빈 동안 수량 state까지
   * 비워져서, 지정가로 바꿨을 때 사용자가 건드린 적 없는 칸이 비어 있게 된다.
   */
  const buyQuantityInput = amountMode
    ? (() => {
        const qty = presetQuantity({
          side: 'BUY',
          isCrypto: true,
          ratio: 1,
          availableCash: buyAmountNumber,
          held: 0,
          unitPrice: latestPrice,
        })
        return qty > 0 ? String(Number(qty.toFixed(CRYPTO_QTY_DECIMALS))) : ''
      })()
    : quantity
  const buyQuantityNumber = Number(buyQuantityInput)

  const buyKey = useIdempotencyKey([
    attempt.attemptId,
    attempt.runNumber,
    'BUY',
    buyQuantityInput,
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

  const tourStorageKey = `finplay.tour.tutorial.${market}`

  /**
   * 안내를 처음부터 다시 튼다. SpotlightTour는 마운트 시점에 localStorage를 한 번만 읽으므로
   * 키를 지우는 것만으로는 부족하고 리마운트까지 해야 한다.
   */
  const handleReplayTour = useCallback(() => {
    try {
      localStorage.removeItem(tourStorageKey)
    } catch {
      // 저장소가 막힌 환경에서도 리마운트만으로 안내는 다시 뜬다.
    }
    setTourNonce((n) => n + 1)
  }, [tourStorageKey])

  // 예약을 새로 건 직후에만 카드를 화면 안으로 옮긴다. setState 직후에는 아직 DOM이 없어
  // 동기 호출로는 잡히지 않으므로, 카드가 마운트된 뒤의 효과에서 부른다.
  useEffect(() => {
    if (pendingCreatedNonce === 0) return
    const card = pendingCardRef.current
    // jsdom에는 scrollIntoView가 없다.
    if (!card || typeof card.scrollIntoView !== 'function') return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingCreatedNonce])

  /**
   * 종목 목록은 고른 뒤에도 왼쪽 컬럼에 계속 남는다(모의투자 화면과 같은 3컬럼 구조) — 그래서
   * SELECTING_INSTRUMENT 일 때만 읽던 것을 항상 읽도록 바꿨다. 목록은 시장당 샌드박스 3건이고
   * instrumentService 가 캐시하므로 매번 네트워크를 타지 않는다.
   */
  useEffect(() => {
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
  }, [market, showError])

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
    // 튜토리얼 전용 주문 조회(435)는 인증 사용자의 현재 attempt·run 귀속 주문만 오므로
    // attemptId·runNumber로 다시 걸러낼 필요가 없다 — /api/orders/pending 시절과 다른 점이다.
    getPracticeAttemptOrders(market)
      .then((orders) => {
        if (cancelled) return
        const found = orders.find(
          (order) =>
            order.instrumentId === attempt.instrumentId &&
            order.orderType === 'LIMIT' &&
            order.status === 'PENDING',
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
    // 부모(pages/Tutorial.tsx)가 key={attemptId:runNumber}로 이 컴포넌트를 통째로 remount 시켜서
    // 실제로는 값이 바뀌기 전에 효과가 새로 도는데, 그 key가 사라지면 이전 실행의 예약을 그대로
    // 들고 있게 되므로 의존성은 그대로 남겨 둔다.
  }, [attempt.attemptId, attempt.instrumentId, attempt.runNumber, market, replay])

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
          // 튜토리얼 전용 주문 조회(435)는 상태 무관 전부 오므로 한 번의 호출로 여전히 대기
          // 중인지, 체결·취소로 끝났는지를 함께 판단한다 — /api/orders/pending 시절처럼 "사라졌는지"와
          // "왜 사라졌는지"를 따로 조회할 필요가 없다.
          const orders = await getPracticeAttemptOrders(market)
          if (stopped) return
          const foundStatus = orders.find((order) => order.orderId === pending.orderId)?.status
          if (foundStatus !== 'PENDING') {
            // 카드를 그냥 지우면 팔렸는지 취소됐는지 알 수 없다 — 확인한 status만 말하고,
            // 목록에서 아예 찾지 못했으면 지어내지 않고 UNKNOWN으로 남긴다.
            setPendingOrder(null)
            setAmendOpen(false)
            setPendingOutcome({
              status: foundStatus ?? 'UNKNOWN',
              side: pending.side,
              quantity: pending.quantity,
              limitPrice: pending.limitPrice,
            })
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
      // 기본 문구("먼저 종목을 사고, 차트에서 가격을 한 번 확인해 주세요")는 단계 진행용이라 재시작에서는
      // 완전히 엉뚱하게 읽힌다. 실제로 프로덕션에서 이 문장이 떴다(백엔드 #433 — 샌드박스 종목 도입 전에
      // 실제 종목으로 완료한 계정의 코인 재시작이 409). 재시작 맥락의 문구로 덮는다.
      showError(
        'restart',
        toUserMessage(error, {
          PRACTICE_EVIDENCE_MISSING:
            '지금은 이 연습을 다시 시작할 수 없습니다. 아직 정리되지 않은 주문이 남아 있거나, 예전 방식으로 만들어진 기록이라 서버가 정리하지 못하는 경우입니다. 잠시 뒤에 다시 시도해 주세요.',
        }),
      )
    } finally {
      setRestarting(false)
      setShowRestartConfirm(false)
    }
  }, [clearError, market, onAttemptChange, onRefresh, showError])

  /**
   * 손절·익절 프리셋 선택(042, 이슈 #477). 서버가 "지금 보유 중인가"로 잠그므로(EXITPRESET-003)
   * 매수 전 단계에서는 항상 통과한다 — 이 화면이 재진입 UI를 아직 갖추지 않아, 여기서는 그 경우가
   * 실제로 일어나지 않는다. `attempt.exitPresetLocked`로 버튼 자체를 미리 막아 두는 것과는 별개로,
   * 서버가 막으면 그 오류를 그대로 보여준다.
   */
  const handleSelectPreset = useCallback(
    async (preset: PracticeExitPreset) => {
      if (preset === attempt.selectedExitPreset || presetSaving) return
      setPresetSaving(true)
      clearError()
      try {
        const updated = await selectExitPreset(market, preset)
        onAttemptChange(updated)
      } catch (error) {
        showError('preset', toUserMessage(error))
      } finally {
        setPresetSaving(false)
      }
    },
    [attempt.selectedExitPreset, clearError, market, onAttemptChange, presetSaving, showError],
  )

  const handleBuy = useCallback(async () => {
    if (attempt.instrumentId === null) return
    const parsed = Number(buyQuantityInput)
    if (!(parsed > 0) || (market === 'STOCK' && !Number.isInteger(parsed))) {
      showError(
        'buy',
        market === 'STOCK'
          ? '주식은 1주 단위입니다. 1 이상의 정수로 적어 주세요.'
          : '얼마어치 구매할지 적어 주세요.',
      )
      return
    }
    setBuying(true)
    clearError()
    try {
      if (buyOrderType === 'LIMIT') {
        const parsedLimit = Number(buyLimitPrice)
        if (market !== 'CRYPTO' || !(parsedLimit > 0)) {
          showError('buy', '얼마가 되면 구매할지 값을 적어 주세요.')
          return
        }
        const created = await placeLimitOrder(
          {
            market: 'CRYPTO',
            instrumentId: attempt.instrumentId,
            side: 'BUY',
            quantity: buyQuantityInput,
            limitPrice: buyLimitPrice,
          },
          buyKey,
        )
        setPendingOrder(created)
        setPendingOutcome(null)
        setPendingCreatedNonce((n) => n + 1)
        bumpTutorial()
        return
      }
      await placeOrder(
        {
          market,
          instrumentId: attempt.instrumentId,
          side: 'BUY',
          orderType: 'MARKET',
          quantity: buyQuantityInput,
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
  }, [
    attempt.instrumentId,
    buyKey,
    buyLimitPrice,
    buyOrderType,
    buyQuantityInput,
    clearError,
    market,
    onRefresh,
    showError,
  ])

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
              PRACTICE_EVIDENCE_MISSING: '가격을 지켜보려면 먼저 구매가 끝나 있어야 합니다. 화면을 새로고침해 진행 상황을 확인해 주세요.',
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
          showError('sell', '얼마가 되면 판매할지 값을 적어 주세요.')
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
        setPendingOutcome(null)
        setPendingCreatedNonce((n) => n + 1)
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

  /**
   * 매도 버튼을 눌렀을 때의 진입점. 서버는 이제 관찰 여부와 무관하게 매수 직후 곧바로 매도를 열어
   * 두지만, 한 번도 지켜보지 않은 채 파는 것은 사용자가 의도한 게 맞는지 확인이 필요하다 — 관찰
   * 기록이 하나도 없으면(observed === false) 실제 매도 API를 부르기 전에 확인창을 먼저 띄운다.
   */
  const handleSellClick = useCallback(() => {
    if (!observed) {
      setShowSellNoObserveConfirm(true)
      return
    }
    void handleSell()
  }, [handleSell, observed])

  const handleSellNoObserveConfirm = useCallback(() => {
    setShowSellNoObserveConfirm(false)
    void handleSell()
  }, [handleSell])

  const handleSellNoObserveCancel = useCallback(() => {
    setShowSellNoObserveConfirm(false)
  }, [])

  const handleCancelPending = useCallback(async () => {
    if (!pendingOrder || cancellingPending) return
    setCancellingPending(true)
    clearError()
    try {
      await cancelLimitOrder(pendingOrder.orderId)
      setPendingOutcome({
        status: 'CANCELLED',
        side: pendingOrder.side,
        quantity: pendingOrder.quantity,
        limitPrice: pendingOrder.limitPrice,
      })
      setPendingOrder(null)
      setAmendOpen(false)
      await onRefresh()
    } catch (error) {
      showError('pending', toUserMessage(error))
    } finally {
      setCancellingPending(false)
    }
  }, [cancellingPending, clearError, onRefresh, pendingOrder, showError])

  /** 예약 값·개수 고치기를 연다. 지금 걸려 있는 값에서 시작해야 무엇을 바꾸는지 알 수 있다. */
  const handleAmendOpen = useCallback(() => {
    if (!pendingOrder) return
    setAmendPrice(String(pendingOrder.limitPrice))
    setAmendQuantity(String(pendingOrder.quantity))
    setAmendOpen(true)
    clearError()
  }, [clearError, pendingOrder])

  /**
   * 취소 후 재주문이 아니라 정정 API를 쓴다 — 절대값 지정이라 멱등이고 Idempotency-Key가 필요 없으며,
   * 해제→재예약이 한 트랜잭션이라 중간에 실패해도 예약이 사라지지 않는다.
   */
  const handleAmendPending = useCallback(async () => {
    if (!pendingOrder || amending) return
    const parsedPrice = Number(amendPrice)
    const parsedQuantity = Number(amendQuantity)
    if (!(parsedPrice > 0) || !(parsedQuantity > 0)) {
      showError('pending', '바꿀 값과 개수를 0보다 크게 적어 주세요.')
      return
    }
    setAmending(true)
    clearError()
    try {
      const updated = await amendLimitOrder(pendingOrder.orderId, {
        limitPrice: amendPrice,
        quantity: amendQuantity,
      })
      setPendingOrder(updated)
      setAmendOpen(false)
      await onRefresh()
    } catch (error) {
      showError(
        'pending',
        toUserMessage(error, {
          ORDER_ALREADY_FILLED: '이미 체결된 주문이라 고칠 수 없습니다.',
          ORDER_ALREADY_CANCELLED: '이미 취소된 주문이라 고칠 수 없습니다.',
        }),
      )
    } finally {
      setAmending(false)
    }
  }, [amendPrice, amendQuantity, amending, clearError, onRefresh, pendingOrder, showError])

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
      setAmendOpen(false)
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
      // 보상 금액은 갱신된 progress.rewardAmount에서 읽으므로 onRefresh 뒤에 연다.
      if (saved.rewardGranted) setCelebrating(true)
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
  const tourSteps = useMemo(() => buildTourSteps(market, pendingOrder !== null), [market, pendingOrder])

  /**
   * 3컬럼 재구성 전에는 매수·매도 단계 카드가 따로 떠 있어서 예약 카드를 "주문을 건 쪽 카드 안"에
   * 그릴지 바깥에 그릴지 골라야 했다. 이제 주문은 한 패널 안에서만 일어나므로 자리가 하나뿐이다.
   */
  const showPendingCard = pendingOrder !== null && !replay

  /** 모의투자 화면과 같은 액센트·활성색을 쓴다(pages/Trade.tsx). */
  const accent = market === 'CRYPTO' ? 'coin' : 'deepTeal'
  const tabActiveBorder = market === 'CRYPTO' ? 'border-coin' : 'border-[#0D9488]'
  const activeRowTone =
    market === 'CRYPTO'
      ? 'bg-coin-soft border border-coin/40'
      : 'bg-[#0D9488]/10 border border-[#0D9488]/40'
  const activeRowText = market === 'CRYPTO' ? 'text-coin' : 'text-[#2DD4BF]'

  /**
   * 매수 전 미리보기(BuyRiskPreviewLine)가 쓸, 지금 고른 프리셋의 실제 비율. 못 찾으면(응답 지연 등)
   * 서버 기본값(BALANCED, −3%·+5%)으로 어림한다 — 프리셋 목록이 아직 안 왔다고 미리보기 자체를
   * 지우면 화면이 매번 깜빡인다.
   */
  const selectedPresetOption =
    attempt.availableExitPresets.find((option) => option.preset === attempt.selectedExitPreset) ?? null
  const previewStopLossRate = selectedPresetOption?.stopLossRate ?? 3
  const previewTakeProfitRate = selectedPresetOption?.takeProfitRate ?? 5

  /**
   * 되돌아보기는 팔고 난 뒤에야 할 일이 생긴다. 그전에는 탭을 잠그고, 전량 매도되는 순간 자동으로
   * 넘어간다 — 안내형 흐름의 마지막 단계를 탭 뒤에 숨겨 두지 않기 위해서다.
   */
  const reviewReady = replay || fullySold
  useEffect(() => {
    if (reviewReady) setPanelTab('review')
  }, [reviewReady])

  const pendingCard =
    pendingOrder === null ? null : (
      <PendingOrderCard
        cardRef={pendingCardRef}
        order={pendingOrder}
        latestPrice={latestPrice}
        error={flowError}
        busy={cancellingPending}
        amendOpen={amendOpen}
        amendPrice={amendPrice}
        amendQuantity={amendQuantity}
        amending={amending}
        onFillNow={() => void handleFillPendingNow()}
        onAmendOpen={handleAmendOpen}
        onAmendClose={() => setAmendOpen(false)}
        onAmendSubmit={() => void handleAmendPending()}
        onAmendPriceChange={setAmendPrice}
        onAmendQuantityChange={setAmendQuantity}
        onCancel={() => void handleCancelPending()}
      />
    )

  /** 지금 어느 쪽 주문을 하는 단계인지. 매수 전이면 매수, 산 뒤에는 매도다. */
  const orderSide: OrderSide = attempt.riskSnapshot ? 'SELL' : 'BUY'

  const orderPanelBody = replay ? (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted">
        끝난 연습이라 여기서는 사고팔 수 없습니다. 옆 차트도 멈춰 있어요.
      </p>
      <LinkButton to="/trade" withIcon>
        실전 거래 시작하기
      </LinkButton>
    </div>
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
  ) : attempt.status === 'SELECTING_INSTRUMENT' ? (
    <p className="text-sm leading-relaxed text-muted">
      왼쪽에서 종목을 하나 고르면 여기에서 사고팔 수 있습니다.
    </p>
  ) : (
    <div className="space-y-3">
      {/* 끝낸 단계를 지우지 않고 한 줄로 남긴다 — 방금 자기가 한 게 몇 번이었는지 확인시켜 준다. */}
      <DoneLine text={`1. 고르기 완료${selectedInstrument ? ` · ${selectedInstrument.name}` : ''}`} />

      {/*
        매수/매도 토글 — 모의투자 화면과 같은 자리·같은 모양이다. 다만 튜토리얼은 "사고 나서 판다"는
        한 방향 연습이라 지금 할 수 있는 쪽만 눌린다. 눌리지 않는 쪽도 지우지 않고 남긴다 —
        실전 화면에서 처음 보는 컨트롤이 되면 안 된다.
      */}
      <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
        {(['BUY', 'SELL'] as OrderSide[]).map((value) => {
          const active = orderSide === value
          const activeTone =
            value === 'BUY'
              ? 'bg-gain/15 text-gain ring-1 ring-gain/40'
              : 'bg-loss/15 text-loss ring-1 ring-loss/40'
          return (
            <button
              key={value}
              type="button"
              disabled={!active}
              aria-pressed={active}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                active ? activeTone : 'text-muted disabled:opacity-50'
              }`}
            >
              {value === 'BUY' ? '구매' : '판매'}
            </button>
          )
        })}
      </div>

      {orderSide === 'BUY' ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">
            {amountMode ? '2. 얼마어치 구매할지 정합니다 (매수)' : '2. 몇 개 구매할지 정합니다 (매수)'}
          </h2>
          <CurrentPriceBox price={latestPrice} note="3초마다 새로 불러옵니다." />
          <p className="text-xs leading-relaxed text-muted">
            사는 순간의 값을 기준으로 팔 기준선 두 개(손절·익절)가 자동으로 만들어집니다. 손절선은 값이
            이만큼 떨어지면 더 잃지 않도록 팔라고 알려주는 선이고, 익절선은 이만큼 오르면 이익을 챙기고
            팔라고 알려주는 선이에요. 아래에서 그 폭을 고를 수 있습니다.
          </p>
          <ExitPresetPicker
            options={attempt.availableExitPresets}
            selected={attempt.selectedExitPreset}
            locked={attempt.exitPresetLocked}
            saving={presetSaving}
            activeClassName={`${activeRowTone} ${activeRowText}`}
            onSelect={(preset) => void handleSelectPreset(preset)}
          />
          <ErrorNote error={flowError} scope="preset" />
          {market === 'CRYPTO' && (
            <>
              <div
                data-tour="order-type"
                className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]"
              >
                {(['MARKET', 'LIMIT'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={buyOrderType === type}
                    onClick={() => setBuyOrderType(type)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                      buyOrderType === type
                        ? 'bg-coin-soft text-coin ring-1 ring-coin/40'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {type === 'MARKET' ? '시장가' : '지정가'}
                  </button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted">
                시장가는 지금 값에 바로 구매합니다(처음이라면 이걸 추천합니다). 지정가는 원하는 값이 될
                때까지 기다립니다.
              </p>
            </>
          )}
          {/*
            주식에는 지정가 토글 자체가 없지만(코인 전용) 설명은 볼 수 있어야 한다 —
            주식만 해 본 사용자는 이 개념을 아예 못 보고 실전 화면에서 처음 마주치게 된다.
          */}
          <OrderTypeGuideButton onClick={() => setOrderTypeGuideOpen(true)} />
          {/* 지정가 입력을 수량보다 먼저 둔다 — 모의투자 화면과 같은 순서다. */}
          {market === 'CRYPTO' && buyOrderType === 'LIMIT' && (
            <LimitPriceField
              id="tutorial-buy-limit-price"
              label="지정가"
              value={buyLimitPrice}
              onChange={setBuyLimitPrice}
              latestPrice={latestPrice}
            />
          )}
          {amountMode ? (
            <div>
              {/*
                라벨·placeholder를 모의투자 화면(pages/Trade.tsx)의 "주문 금액"과 똑같이 맞춘다.
                "주문 가능" 잔액·퍼센트 버튼(10/25/50/75/최대)은 아직 붙이지 않는다 — 튜토리얼 계좌
                잔액은 진입·재시작 응답에만 실제 값이 오고 종목 선택(PUT .../instrument) 이후로는
                0으로 죽어 있어(TUTORIAL-CASH-ISOL-011), 이 시점엔 정확한 "최대"를 계산할 방법이
                없다. 잘못된 잔액으로 버튼을 만드느니 안 만드는 게 낫다 — 백엔드에 넘긴다.
              */}
              <label htmlFor="tutorial-buy-amount" className="mb-1.5 block text-sm font-medium text-ink">
                주문 금액
              </label>
              <input
                id="tutorial-buy-amount"
                value={buyAmount}
                data-tour="quantity"
                onChange={(event) => setBuyAmount(event.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder={
                  selectedInstrument ? `최소 금액 ${formatKRW(selectedInstrument.minOrderAmount)}` : '0'
                }
                className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                코인은 개수가 아니라 금액으로 삽니다. 실전 화면도 같은 방식이에요.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="tutorial-buy-quantity" className="mb-1.5 block text-sm font-medium text-ink">
                몇 개 구매할까요{market === 'STOCK' ? ' (1주 단위)' : ''}
              </label>
              <input
                id="tutorial-buy-quantity"
                value={quantity}
                data-tour="quantity"
                onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </div>
          )}
          {buyUnitPrice !== null && buyQuantityNumber > 0 && (
            <div className="space-y-1.5 rounded-2xl bg-elevated px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                {/*
                  실전 화면은 금액 입력 모드에서 KRW 총액이 아니라 살 수량("0.05 BTC")을 보여준다 —
                  이미 입력한 금액을 그대로 되읽어 주는 대신, 그 금액으로 몇 개를 살 수 있는지가
                  사용자가 실제로 궁금한 값이기 때문이다. 라벨·값 모양을 그대로 맞춘다.
                */}
                <span className="text-muted">{amountMode ? '예상 매수' : '예상 주문금액 (추정)'}</span>
                <span className="font-medium text-ink tabular">
                  {amountMode
                    ? `${buyQuantityInput} ${selectedInstrument?.symbol ?? ''}`
                    : formatKRW(buyUnitPrice * buyQuantityNumber)}
                </span>
              </div>
              <p className="pt-1 text-xs leading-relaxed text-muted">
                {amountMode
                  ? '현재가 기준 예상 수량이며, 체결 시점 가격에 따라 실제와 다를 수 있어요'
                  : `${quantity}개 × ${formatKRW(buyUnitPrice)} 로 계산한 추정치예요`}{' '}
                · 연습용 가짜 돈입니다
              </p>
            </div>
          )}
          <BuyRiskPreviewLine
            latestPrice={latestPrice}
            quantity={buyQuantityNumber}
            stopLossRate={previewStopLossRate}
            takeProfitRate={previewTakeProfitRate}
          />
          <Button
            type="button"
            data-tour="buy"
            size="lg"
            variant="buy"
            className="w-full"
            disabled={buying || pendingOrder !== null}
            onClick={() => void handleBuy()}
          >
            {buying ? '주문하는 중…' : buyOrderType === 'LIMIT' ? '정한 값에 주문 넣기' : '지금 값에 구매하기'}
          </Button>
          {pendingOrder !== null && <PendingBlocksOrderNote />}
          <ErrorNote error={flowError} scope="buy" />
        </div>
      ) : (
        <div className="space-y-3">
          <DoneLine
            text={buyDoneText(evidence?.buyQuantity ?? null, attempt.riskSnapshot?.entryPrice ?? null)}
          />

          {/*
            3단계(지켜보기)는 더 이상 별도 카드가 아니다 — 매수 직후 매도가 열리므로(백엔드 #429)
            지켜보기와 팔기가 같은 화면에서 동시에 일어난다. 옆 차트를 보라고 말하는 자리로 남긴다.
          */}
          <div className="rounded-2xl border border-line bg-elevated/60 px-4 py-3">
            <p className="text-sm font-medium text-ink">3. 값이 어디로 가는지 지켜봅니다</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              값이 두 기준선에 얼마나 가까워졌는지 옆 차트로 확인하세요. 값이 오르내리는 걸 직접 눈으로
              보면서 실제 투자에서 느끼는 감을 미리 익힐 수 있습니다. 지켜본 기록은 자동으로 남습니다.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {observing && <span className="text-xs text-muted">기록하는 중…</span>}
              {observed && <span className="text-xs text-gain">확인 완료</span>}
            </div>
            {latestPrice !== null &&
              attempt.riskSnapshot &&
              remainingQuantity !== null &&
              remainingQuantity > 0 && (
                <div className="mt-3">
                  <LivePnl
                    entryPrice={attempt.riskSnapshot.entryPrice}
                    latestPrice={latestPrice}
                    quantity={remainingQuantity}
                  />
                </div>
              )}
          </div>

          <h2 className="text-sm font-semibold text-ink">4. 판매(매도)하고, 왜 그랬는지 적어 봅니다</h2>
          <p className="text-xs leading-relaxed text-muted">
            매도는 산 종목을 다시 팔아서 값을 돈으로 바꾸는 것을 뜻합니다. 판 뒤에는 왜 그때 팔았는지 한
            줄로 적어 보세요. 잘한 점과 아쉬운 점을 스스로 짚어보면 다음 연습에서 더 나은 판단을 할 수
            있습니다.
          </p>
          <CurrentPriceBox price={latestPrice} note="3초마다 새로 불러옵니다." />
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">주문 가능</p>
            <div className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular">
              {remainingQuantity ?? '—'}
              {market === 'CRYPTO' ? '' : '주'}
            </div>
          </div>
          {market === 'CRYPTO' && (
            <>
              {/*
                모의투자 화면(pages/Trade.tsx)의 매도는 시장가·지정가·예약 매도 세 탭이다. 실전에 있는
                탭이 여기 없으면 사용자가 실전에서 처음 마주치게 되므로 자리는 같게 만들되, 튜토리얼의
                손절·익절선은 사용자가 거는 것이 아니라 **매수 순간 서버가 체결가에서 자동으로 만들기
                때문에**(TUTORIAL-FLOW-008) 지금은 누를 수 없다. 어둡게만 두면 "왜 안 눌리지"에서
                막히므로 아래에 이유 한 줄을 반드시 함께 둔다.
              */}
              <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                {(['MARKET', 'LIMIT'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={sellOrderType === type}
                    onClick={() => setSellOrderType(type)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring ${
                      sellOrderType === type
                        ? 'bg-coin-soft text-coin ring-1 ring-coin/40'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {type === 'MARKET' ? '시장가' : '지정가'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-describedby={reservedSellNoteId}
                  className="flex-1 cursor-default rounded-full px-4 py-2 text-sm font-medium text-muted opacity-45"
                >
                  예약 매도
                </button>
              </div>
              <p id={reservedSellNoteId} className="text-xs leading-relaxed text-muted">
                예약 매도는 실전에서 손절·익절 가격을 미리 걸어두는 기능입니다. 이 연습에서는 살 때
                기준선이 자동으로 만들어지므로 따로 걸지 않습니다.
              </p>
            </>
          )}
          <OrderTypeGuideButton onClick={() => setOrderTypeGuideOpen(true)} />
          {market === 'CRYPTO' && sellOrderType === 'LIMIT' && (
            <LimitPriceField
              id="tutorial-sell-limit-price"
              label="지정가"
              value={sellLimitPrice}
              onChange={setSellLimitPrice}
              latestPrice={latestPrice}
            />
          )}
          <Button
            type="button"
            data-tour="sell"
            size="lg"
            variant="sell"
            className="w-full"
            disabled={
              selling ||
              sellLocked ||
              pendingOrder !== null ||
              remainingQuantity === null ||
              remainingQuantity <= 0
            }
            onClick={handleSellClick}
          >
            {selling
              ? '주문하는 중…'
              : remainingQuantity === null
                ? // 수량을 모르는 상태다. 0으로 지어내지 않고 개수를 뺀다 — 버튼은 위에서 이미 잠긴다.
                  sellOrderType === 'LIMIT'
                  ? '가진 만큼 정한 값에 판매하기'
                  : '가진 만큼 전부 판매하기'
                : sellOrderType === 'LIMIT'
                  ? `가진 ${remainingQuantity}개 정한 값에 판매하기`
                  : `가진 ${remainingQuantity}개 전부 판매하기`}
          </Button>
          {/*
            잠긴 이유가 여럿이면 하나만 말한다. 예약이 걸려 있는 건 방금 자기가 한 행동의
            결과라 가장 먼저 알려 준다. 수량을 모르는 상태에서 "잠시 뒤 팔 수 있어요"는
            영원히 오지 않을 일을 약속하는 거짓말이라, 그때는 관찰 안내를 밀어내고 실제 이유를 쓴다.
          */}
          {pendingOrder !== null ? (
            <PendingBlocksOrderNote />
          ) : remainingQuantity === null ? (
            <p className="text-xs text-muted">
              지금 가진 수량을 불러오지 못했습니다. 잠시 뒤에도 그대로면 위의 "처음부터 다시 시작"으로
              다시 해 주세요.
            </p>
          ) : (
            sellLocked && (
              <p className="text-xs text-muted">가격을 조금 더 지켜봐야 합니다. 잠시 뒤 팔 수 있어요.</p>
            )
          )}
          <ErrorNote error={flowError} scope="sell" />
        </div>
      )}

      {showPendingCard && pendingCard}
    </div>
  )

  const reviewPanelBody = replay ? (
    <div>
      <p className="text-lg font-semibold text-ink">{completionTitle(market)}</p>
      {/*
        문구는 축하 모달과 같은 곳(CompletionCelebration)에서 파생시킨다 — 같은 완료를 두 문구로
        말하면 사용자가 다른 일로 읽는다. 다만 "축하합니다"는 완료한 그 순간의 말이라 모달에만 둔다.
        이 카드는 나중에 다시 들어와도 보이는 기록 화면이라 매번 축하하면 어색해진다.
      */}
      {progress.rewardAmount !== null && (
        <p className="mt-2 text-sm leading-relaxed text-ink">
          {rewardSentence.before}
          {formatKRW(progress.rewardAmount)}
          {rewardSentence.after}
        </p>
      )}
      {tradeResult && (
        <div className="mt-4">
          <TradeResultBlock result={tradeResult} />
        </div>
      )}
      {/*
        진입별 대조. 재진입한 사용자는 카드가 두 장이고 각각 손절·익절로 다르게 보인다 — 위의
        TradeResultBlock은 실행 전체 합이라 첫 매도 하나만 말한다(금액은 맞고 이야기가 틀린다).
      */}
      {progress.entries.length > 0 && (
        <div className="mt-4">
          <EntryComparison entries={progress.entries} layout="narrow" />
        </div>
      )}
      {progress.entries.length > 0 && (
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={() => setReviewingResult(true)}>
            결과 다시 보기
          </Button>
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
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        실전에는 실제로 거래되는 종목이 있습니다. 여기서 연습한 종목은 가상이라 포트폴리오와 랭킹에는
        잡히지 않습니다.
      </p>
      <dl className="mt-5 grid gap-3">
        <div>
          <dt className="text-xs text-muted">산 개수</dt>
          <dd className="mt-1 tabular text-ink">{evidence?.buyQuantity ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">판 개수</dt>
          <dd className="mt-1 tabular text-ink">{evidence?.sellQuantity ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">남은 개수</dt>
          <dd className="mt-1 tabular text-ink">{evidence?.remainingQuantity ?? '-'}</dd>
        </div>
      </dl>
      {progress.completedAt && (
        <p className="mt-4 text-xs text-muted">완료 {formatDateTime(progress.completedAt)}</p>
      )}
      {/* 재지급 제한은 사실이지만 축하보다 먼저 읽히면 안 된다 — 카드 맨 아래 작은 글씨로 둔다. */}
      {progress.rewardAmount !== null && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          완료 보상은 이 시장에서 최초 1회만 지급됩니다. 재시작해 다시 완료해도 보상은 추가로
          지급되지 않습니다.
        </p>
      )}
    </div>
  ) : (
    <div className="space-y-3">
      {/*
        evidence 없이 전량 매도된 상태. tick 루프가 관찰을 계속 쌓아 스스로 풀리므로 화면이 멈춘 게
        아니라는 걸 단계 번호와 함께 알린다.
      */}
      {recoveringObservation && (
        <p className="rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm text-muted">
          3. 가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.
        </p>
      )}
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
          <p className="text-xs text-muted">가격 확인 기록을 남기는 중입니다. 잠시만 기다려 주세요.</p>
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
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SpotlightTour
        key={tourNonce}
        active={!replay}
        storageKey={tourStorageKey}
        steps={tourSteps}
      />

      {/*
        속보 자막 — tick(3초)마다가 아니라 revealedEvents가 실제로 늘어난 순간에만 흐른다
        (컴포넌트 안에서 판정). 대본이 없는 실행은 events가 늘 비어 있어 자연히 뜨지 않는다.
      */}
      {scenarioStage !== null && <BreakingNewsCrawl market={market} events={revealedEvents} />}

      {/*
        진행 표시줄 — 모의투자 화면에는 없는 튜토리얼 고유 안내 장치(단계 레일·회차·안내 다시 보기)를
        3컬럼 그리드 위 한 줄로 올린다. 그래야 아래 목록·차트·주문 컬럼은 모의투자 화면과 완전히
        같은 구조를 그대로 쓸 수 있다.
      */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <p className="text-sm font-medium text-ink">
            {attempt.runNumber}번째 연습 · {replay ? '완료 기록 다시 보기' : '진행 중'}
          </p>
          <div className="mt-2">
            <StepRail current={uiStep} tone={railTone} />
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              끝난 연습(replay)에는 안내가 가리킬 대상이 하나도 없다 — 눌러도 아무 일이 없는
              버튼이라 아예 숨긴다. 재시작만큼 자주 쓰는 동작이 아니라서(도움말성 보조 기능) 글자
              버튼 대신 물음표 아이콘으로 줄였다 — 재시작과 무게가 같아 보이면 진행을 되돌리는
              동작이 가벼워 보인다(2026-08-20 피드백).
            */}
            {!replay && (
              <button
                type="button"
                aria-label="안내 다시 보기"
                onClick={handleReplayTour}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-xs text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                ?
              </button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={restarting}
              onClick={handleRestartClick}
            >
              {restarting ? '정리하는 중…' : '처음부터 다시 시작'}
            </Button>
          </div>
          <ErrorNote error={flowError} scope="restart" />
        </div>
      </div>

      {!replay && !expired && !fullySold && saleRemainingMs !== null && (
        <div className="shrink-0 pb-4">
          <SaleCountdown remainingMs={saleRemainingMs} />
        </div>
      )}

      {/*
        목록 | (차트 · 주문) 2단 그리드. 폭 비율 20:46:22 와 중첩 구조 모두 모의투자 화면
        (pages/Trade.tsx)을 그대로 따른다 — 왜 한 그리드가 아니라 중첩인지는 그 파일 주석에 있다.
      */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,20fr)_minmax(0,68fr)]">
        {/* 1. 종목 목록 */}
        <Card className="min-h-0" innerClassName="flex h-full min-h-0 flex-col p-3">
          <div className="shrink-0 px-2 pb-2">
            <h2 className="text-sm font-semibold text-ink">
              {attempt.status === 'SELECTING_INSTRUMENT'
                ? '1. 연습할 종목을 고릅니다'
                : market === 'CRYPTO'
                  ? '코인'
                  : '종목'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {attempt.status === 'SELECTING_INSTRUMENT'
                ? '실제 회사가 아니라 연습용으로 만든 가상 종목이에요. 고르면 바로 값이 움직이기 시작합니다.'
                : '이번 연습은 고른 종목 하나로 진행됩니다.'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {instruments.length === 0 ? (
              <ul aria-label="종목을 불러오는 중" className="space-y-1">
                {Array.from({ length: 3 }).map((_, index) => (
                  <li key={index} className="space-y-1.5 px-3 py-2.5">
                    <span className="skeleton block h-3.5 w-2/3" />
                    <span className="skeleton block h-2.5 w-1/3" />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1">
                {instruments.map((instrument, index) => {
                  const active = instrument.instrumentId === attempt.instrumentId
                  const selectable = attempt.status === 'SELECTING_INSTRUMENT' && !replay
                  return (
                    <li key={instrument.instrumentId}>
                      <button
                        type="button"
                        data-tour={index === 0 ? 'instrument' : undefined}
                        disabled={!selectable || busyInstrumentId !== null}
                        aria-current={active}
                        onClick={() => void handleSelect(instrument.instrumentId)}
                        className={`w-full rounded-2xl px-3 py-2.5 text-left transition-colors duration-300 disabled:cursor-default ${
                          active ? activeRowTone : selectable ? 'hover:bg-white/[0.04]' : 'opacity-45'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm font-medium ${active ? activeRowText : 'text-ink'}`}
                            >
                              {instrument.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted tabular">
                              {instrument.symbol}
                            </span>
                          </span>
                          {active && (
                            <span className="flex-none text-right text-sm font-medium text-ink tabular">
                              {latestPrice === null ? '—' : formatKRW(latestPrice)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <ErrorNote error={flowError} scope="select" />
            {/*
              이 화면은 종목을 늘 하나만 보여주므로 목록 아래는 원래 빈 자리다(2026-08-20 피드백).
              그 자리에 사건 피드를 둔다 — 차트 컬럼과 달리 스크롤에 밀릴 걱정이 없다.
            */}
            {scenarioStage !== null && (
              <ScenarioEventFeed
                market={market}
                instrumentName={selectedInstrument?.name ?? null}
                events={revealedEvents}
              />
            )}
          </div>
        </Card>

        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,46fr)_minmax(0,22fr)]">
          {/* 2. 차트 */}
          <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto">
            {/*
              모의투자 화면의 차트 카드는 flex-1 로 남는 높이를 전부 가져가지만, 튜토리얼 카드는
              차트 아래에 요약·캔들 설명·시나리오가 더 붙는다. 같은 방식으로 두면 그 설명들이 높이를
              다 먹고 차트의 flex-1 이 0으로 접힌다(실측). 그래서 이 카드만 높이를 내용에 맡기고,
              넘치는 만큼은 컬럼이 스크롤한다.
            */}
            <Card innerClassName="flex flex-col p-5">
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {selectedInstrument ? selectedInstrument.name : '종목을 선택해 주세요'}
                  </h2>
                  <p className="mt-1 text-xs text-muted tabular">
                    {selectedInstrument ? selectedInstrument.symbol : '—'}
                    {chart ? ` · ${formatDateTime(chart.virtualDateTime)} 기준` : ''}
                  </p>
                </div>
                {attempt.instrumentId !== null && (
                  <div className="text-right">
                    {/*
                      모의투자 화면은 이 자리에 등락률을 쓴다. 튜토리얼에는 비교 기준이 될 전일 종가가
                      없어 값만 둔다 — 설명 문구를 넣었더니 차트가 그리는 확대 버튼과 겹쳤다(실측).
                    */}
                    <p className="text-base font-semibold text-ink tabular md:text-lg">
                      {latestPrice === null ? '불러오는 중…' : formatKRW(latestPrice)}
                    </p>
                  </div>
                )}
              </div>

              {attempt.instrumentId === null ? (
                <p className="mt-6 text-sm leading-relaxed text-muted">
                  왼쪽에서 종목을 하나 고르면 여기에 최근 30일 값 움직임이 그려집니다. 맨 오른쪽 막대
                  하나가 지금 움직이는 오늘입니다.
                </p>
              ) : (
                <div data-tour="chart" className="mt-3 flex flex-col">
                  {/* 폭에서 나오는 21:9 비율로 높이가 정해진다 — 바닥값을 둬서 좁은 창에서도 안 접힌다. */}
                  <div className="flex aspect-[21/9] min-h-[240px] flex-col">
                    <CandleChart
                      candles={candles}
                      interval="1d"
                      maxBars={30}
                      fillHeight
                      showVolume={false}
                      beginnerLabels
                      describedById={chartSummaryId}
                      emptyMessage="차트를 불러오는 중입니다."
                      referenceLines={
                        attempt.riskSnapshot
                          ? [
                              {
                                value: attempt.riskSnapshot.stopLossPrice,
                                tone: 'loss',
                                label: `손절 ${presetRateLabels(attempt.riskSnapshot).stopLoss}`,
                              },
                              {
                                value: attempt.riskSnapshot.takeProfitPrice,
                                tone: 'gain',
                                label: `익절 ${presetRateLabels(attempt.riskSnapshot).takeProfit}`,
                              },
                            ]
                          : undefined
                      }
                    />
                  </div>
                  <div>
                    <ChartSummary
                      latestPrice={latestPrice}
                      high={chartHigh}
                      low={chartLow}
                      dayCount={chart?.candles.length ?? 0}
                      entryPrice={attempt.riskSnapshot?.entryPrice ?? null}
                      stopLossPrice={attempt.riskSnapshot?.stopLossPrice ?? null}
                      takeProfitPrice={attempt.riskSnapshot?.takeProfitPrice ?? null}
                    />
                    {/*
                      전체 사건 목록은 왼쪽 컬럼(ScenarioEventFeed)에 있다 — 낮은 화면에서는 차트
                      자체가 세로 공간을 다 먹어 여기 두면 다시 스크롤 밖으로 밀린다(2026-08-20
                      피드백). 여기는 "지금 상태 + 왼쪽을 보라"는 한 줄만 남긴다. 대본이 없는
                      실행에서는 통째로 빠진다 — 빈 줄을 남기면 "곧 뭔가 온다"는 약속이 된다.
                    */}
                    {scenarioStage !== null && (
                      <ScenarioStatusLine
                        market={market}
                        stage={scenarioStage}
                        progressing={chart?.scenarioProgressing ?? null}
                        causeStatus={chart?.causeStatus ?? null}
                      />
                    )}
                    <div className="mt-4">
                      <CandleGuide />
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      {replay
                        ? '끝난 연습이라 화면만 볼 수 있어요. 여기서는 사고팔 수 없고 가격도 멈춰 있습니다.'
                        : '3초마다 1분씩, 실제보다 빠르게 시간이 흐릅니다. 맨 오른쪽 막대 하나만 오르내립니다.'}
                    </p>
                    {chartError && <p className="mt-2 text-sm text-loss">{chartError}</p>}
                  </div>
                </div>
              )}
            </Card>
            <RiskEducationCard attempt={attempt} holdingQuantity={remainingQuantity} />
          </div>

          {/* 3. 주문 · 되돌아보기 패널 */}
          <div className="h-full min-h-0 space-y-5 overflow-y-auto">
            <Card accent={accent} innerClassName="p-0 overflow-hidden">
              <div className="grid grid-cols-2 border-b border-line">
                {(
                  [
                    ['order', '주문'],
                    ['review', '되돌아보기'],
                  ] as const
                ).map(([value, label]) => {
                  const active = panelTab === value
                  const locked = value === 'review' && !reviewReady
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={locked}
                      onClick={() => setPanelTab(value)}
                      aria-pressed={active}
                      className={`px-4 py-3 text-sm font-medium transition-colors duration-300 disabled:opacity-40 ${
                        active
                          ? `border-b-2 text-ink ${tabActiveBorder}`
                          : 'border-b-2 border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="p-5">{panelTab === 'review' ? reviewPanelBody : orderPanelBody}</div>
            </Card>

            {/*
              예약이 대기 목록에서 사라졌을 때 그 사실을 남긴다. 카드가 조용히 없어지면 사용자는
              체결됐는지 취소됐는지 알 수 없다 — 확인한 status만 말하고, 확인하지 못했으면 못했다고 말한다.
            */}
            {pendingOutcome && !pendingOrder && !replay && (
              <div className="rounded-2xl border border-line bg-elevated/60 px-4 py-3">
                <p className="text-sm leading-relaxed text-ink">{pendingOutcomeText(pendingOutcome)}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  onClick={() => setPendingOutcome(null)}
                >
                  확인
                </Button>
              </div>
            )}

            {/*
              전량 매도하면 지켜보기 블록이 사라진다 — 재시도 버튼을 그 안에 두면 오류가 시키는 행동을 할
              버튼이 화면에서 없어진다. 그래서 패널 밖에서 조건만 보고 항상 노출하고, 관찰 실패 메시지도
              버튼과 같은 자리에 둔다(복기 오류 안에도 같은 버튼이 있으므로 그때는 여기서 뺀다).
            */}
            {!replay && observeFailed && !observing && !observed && flowError?.scope !== 'reflection' && (
              <div className="rounded-2xl border border-loss/30 bg-loss/10 p-3">
                {flowError?.scope === 'observe' && (
                  <p className="mb-2 text-sm text-loss">{flowError.message}</p>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={retryObserve}>
                  관찰 다시 시도
                </Button>
              </div>
            )}

            {/* 화면이 스크롤되지 않는 구조라, 예외 설명은 이 컬럼 맨 아래 접힌 영역에 둔다. */}
            <details className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
              <summary className="cursor-pointer text-sm text-ink">
                나갔다 와도 되나요? 처음부터 다시 하려면?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                새로고침하거나 나갔다 돌아와도 하던 연습이 그대로 이어집니다. 처음부터 다시 하고 싶으면
                위의 “처음부터 다시 시작”을 누르세요. 한 번 더 물어본 뒤에 지금까지 넣은 주문과 산 것을
                정리해 줍니다.
              </p>
            </details>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showRestartConfirm}
        title="처음부터 다시 시작할까요?"
        message="지금 연습의 대기 주문과 가진 종목을 정리하고 종목 고르기부터 다시 시작합니다."
        confirmLabel="다시 시작"
        busy={restarting}
        onConfirm={() => void handleRestartConfirm()}
        onCancel={handleRestartCancel}
      />

      <ConfirmDialog
        open={showSellNoObserveConfirm}
        title="아직 한 번도 지켜보지 않았는데, 그래도 팔까요?"
        message="가격이 어떻게 움직였는지 아직 한 번도 확인하지 않았습니다. 그래도 지금 판매를 진행할 수 있습니다."
        confirmLabel="그래도 판매"
        busy={selling}
        onConfirm={handleSellNoObserveConfirm}
        onCancel={handleSellNoObserveCancel}
      />

      {/*
        튜토리얼에서는 자동으로 열지 않는다 — 스포트라이트 안내와 겹쳐 화면 두 개가 동시에 덮인다.
        누를 때만 연다. 자동 1회 노출은 모의투자 화면(pages/Trade.tsx)이 맡는다.
      */}
      <OrderTypeGuideDialog open={orderTypeGuideOpen} onClose={() => setOrderTypeGuideOpen(false)} />

      <CompletionCelebration
        open={celebrating || reviewingResult}
        market={market}
        rewardAmount={progress.rewardAmount}
        entries={progress.entries}
        revealedEvents={revealedEvents}
        celebrate={celebrating}
        onClose={() => {
          setCelebrating(false)
          setReviewingResult(false)
        }}
      />
    </div>
  )
}
