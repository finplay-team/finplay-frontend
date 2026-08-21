// 영속 attempt를 정본으로 종목 선택부터 완료 replay까지 단일 차트 실습 흐름을 제공하는 컴포넌트
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { CandleChart } from '../CandleChart'
import { Button, LinkButton } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Close } from '../ui/icons'
import { CandleGuide } from './CandleGuide'
import { CompletionCelebration, completionTitle, rewardSentenceParts } from './CompletionCelebration'
import { EntryComparison } from './EntryComparison'
import { ExitJourneyGuide } from './ExitJourneyGuide'
import { FALLBACK_EXIT_RATES, FALLBACK_EXIT_RATE_BOUNDS, rateError, toRateInput } from './ExitRateFields'
import { TutorialExitPlanPanel } from './TutorialExitPlanPanel'
import { BreakingNewsCrawl } from './BreakingNewsCrawl'
import { OrderBasicsStatusLine, ScenarioEventFeed, ScenarioStatusLine } from './ScenarioEventPanel'
import { OrderTypeGuideButton, OrderTypeGuideDialog } from './OrderTypeGuide'
import { SpotlightTour } from './SpotlightTour'
import type { SpotlightStep } from './SpotlightTour'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { formatDateTime, parseLocalDateTime, ratioToPercent } from '../../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { formatKRW, formatPercent, formatSignedKRW } from '../../lib/format'
import { CRYPTO_QTY_DECIMALS, FEE_RATE, presetQuantity } from '../../lib/quantity'
import { bumpTutorial } from '../../lib/tutorialPulse'
import { ensureInstrumentCache, getCachedInstrument, loadInstruments } from '../../services/instrumentService'
import {
  amendLimitOrder,
  cancelLimitOrder,
  placeLimitOrder,
  placeOrder,
} from '../../services/orderService'
import { cancelExitPlan } from '../../services/exitPlanService'
import {
  advancePracticeAttemptScript,
  createPracticeExitPlan,
  getPracticeAttemptChart,
  getPracticeAttemptOrders,
  recordHoldingObservation,
  restartPracticeAttempt,
  saveHoldingReflection,
  selectPracticeInstrument,
  tickPracticeAttempt,
} from '../../services/tutorialService'
import {
  estimateExitPlan,
  readExitExperience,
  readExitPlanCreatable,
  readPendingExitPlan,
} from '../../services/tutorialExitPlan'
import type {
  InvestmentPracticeResponse,
  PracticeAttemptResponse,
  PracticeEvidenceResponse,
  PracticeExitPlanSummary,
  PracticeHoldingReflectionResponse,
  PracticeSellVerdict,
  PracticeTradeResultResponse,
  PracticeTutorialChartResponse,
  TutorialStageProgress,
} from '../../services/tutorialTypes'
import type { Candle, Instrument, LimitOrderResponse, Market, OrderSide } from '../../services/types'

const TICK_MS = 3000
const REFLECTION_MAX = 2000
// 복기 질문 문구는 클라이언트가 소유한다(백엔드 이슈 #432). 예전에는 저장 응답의 `prompt` 필드를 그대로
// 그렸는데, 서버가 요청과 무관한 상수를 내려보내는 구조라 문구 하나 고치는 데 백엔드 배포가 필요했다.
// 입력 라벨과 저장 후 회고 박스가 같은 문구를 써야 하므로 여기 한 곳에서만 정의한다.
//
// **이 문구를 바꾸는 PR은 백엔드의 PracticeHoldingReflectionService.PROMPT_VERSION도 함께 올려야 한다.**
// 백엔드 practice_market_reflections.prompt_version은 "저장된 복기가 어느 세대 질문에 답한 것인가"를
// 복원하려고 있는 컬럼인데, 문구 소유권이 이쪽으로 넘어온 뒤로 서버에는 그 값을 올릴 계기가 없다.
// 여기서 문구만 바꾸고 넘어가면 그 값이 영영 1로 굳어 컬럼의 존재 이유가 사라진다.
const REFLECTION_QUESTION = '오늘 왜 그렇게 사고팔았는지 한 줄로 적어 주세요.'
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
type ErrorScope =
  | 'select'
  | 'buy'
  | 'sell'
  | 'pending'
  | 'observe'
  | 'reflection'
  | 'restart'
  | 'exitPlan'
  | 'advance'
interface FlowError {
  scope: ErrorScope
  message: string
}

const chartSummaryId = 'tutorial-chart-summary'

/** 이 화면이 사용자에게 약속하는 4단계. 서버 chain의 단계 번호와는 별개다(아래 uiStep 주석 참고). */
const STEP_TITLES = ['종목 고르기', '사고팔아보기', '지켜보기', '되돌아보기'] as const

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
        title: '원하는 금액만큼 구매합니다',
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

/**
 * 현재 단계만 글로 보여주면 남은 단계가 몇 개인지, 뭘 더 해야 끝인지 알 수 없다 — "어디까지
 * 테스트해야 하는지 모르겠다"는 피드백(2026-08-21)으로 4단계 전체를 항상 한 줄에 함께 적는다.
 * 지나간 단계는 옅게, 지금 단계는 굵게 남긴다.
 */
function StepRail({ current, tone }: { current: number; tone: string }) {
  return (
    <div className="flex flex-col gap-1.5">
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
      <p className="text-[11px] leading-relaxed text-muted">
        {STEP_TITLES.map((title, index) => (
          <span key={title} className={index + 1 === current ? 'font-medium text-ink' : undefined}>
            {index > 0 ? ' · ' : ''}
            {index + 1}. {title}
          </span>
        ))}
      </p>
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

/**
 * 2단계(주문 방법) 학습 체크리스트(이슈 #503). 서버가 실행 세대 단위로 판정한 값을 그대로 그린다 —
 * **로컬로 세지 않는다.** 새로고침해도 서버가 다시 판정하므로 이 값만 그대로 받아 그리면 된다.
 *
 * 지정가 항목은 코인 전용이다 — `limitBuySellCompleted`는 주식(STOCK)에서 영원히 `false`라, 넣어
 * 두면 주식 사용자에게는 평생 못 채우는 항목으로 보인다. 그래서 주식에서는 아예 뺀다.
 */
function StageProgressChecklist({
  market,
  progress,
  exitPlanned,
  autoStoppedThisRun,
}: {
  market: Market
  progress: TutorialStageProgress
  /**
   * 이 실행에서 손절·익절 기준을 실제로 세워 봤는가 — 예약을 걸었거나 이미 겪었으면 참이다.
   *
   * ⚠️ **배포 후 뗄 폴백이다.** 서버의 `exitPresetSelected`는 원래 `PUT .../exit-rates`로만 참이 되는데
   * 2026-08-21 재설계로 화면이 그 경로를 안 부르게 되면서 영영 안 채워지는 항목이 됐었다. 백엔드가
   * **판정을 "이 실행 세대에 예약이 하나라도 있으면 참"으로 넓혔다**(2026-08-21 확인) — 상태 무관이라
   * 체결·취소된 예약도 세고, 취소해도 false로 돌아가지 않는다. **서버 판정이 이 화면 판정보다 좁아지는
   * 경우는 없다** — "겪었다"는 그 예약이 체결됐다는 뜻이라 서버 쪽이 항상 함께 참이다. 아직 머지·배포
   * 전이라 그때까지만 이 OR를 남긴다. 배포되면 이 prop과 인자를 지우고
   * `progress.exitPresetSelected`만 그린다 — 판정 소스는 하나가 낫다.
   */
  exitPlanned: boolean
  /**
   * 이 실행에 손절·익절로 자동 정리된 매도가 이미 있는가. `marketBuySellCompleted`는 **사용자가 낸**
   * 시장가 매도만 센다(문서 명시, "의도된 동작") — 자동 청산은 세지 않는다. 그런데 화면에는 그 이유를
   * 말해 주는 데가 없어서 "샀다 팔렸는데 왜 체크가 안 되지"로 막힌다(2026-08-20 실사용 중 발견).
   * 이 조건이 true면 항목 아래에 이유를 한 줄 붙인다.
   */
  autoStoppedThisRun: boolean
}) {
  const items: { key: string; label: string; done: boolean }[] = [
    { key: 'market', label: '시장가 매매', done: progress.marketBuySellCompleted },
  ]
  if (market === 'CRYPTO') {
    items.push({ key: 'limit', label: '지정가 매매', done: progress.limitBuySellCompleted })
  }
  items.push({
    key: 'preset',
    label: '손절·익절 기준 정하기',
    done: progress.exitPresetSelected || exitPlanned,
  })
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="주문 방법 학습 체크리스트">
        {items.map((item) => (
          <span
            key={item.key}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              item.done ? 'border-gain/40 bg-gain/10 text-gain' : 'border-line bg-elevated text-muted'
            }`}
          >
            {item.done ? '✓ ' : ''}
            {item.label}
          </span>
        ))}
      </div>
      {!progress.marketBuySellCompleted && autoStoppedThisRun && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          손절·익절로 자동 정리된 매도는 "시장가 매매"로 세지 않습니다. 선에 닿기 전에 직접 매도
          버튼을 눌러야 이 항목이 채워집니다.
        </p>
      )}
    </div>
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
 * 되돌아보기(진행 중 실행의 손익·복기 입력)를 좁은 사이드 패널 탭 대신 큰 화면으로 띄운다
 * (2026-08-21 피드백 — "옆에만 뜨네ㅠㅠ", 가독성이 떨어진다). 완료 축하 모달(CompletionCelebration)과
 * 같은 틀(어두운 배경·중앙 카드·ESC·바깥 클릭으로 닫기)을 그대로 따라 한 화면 안에서 낯설지 않다.
 * replay(완료 기록 다시 보기)는 대상이 아니다 — 그쪽은 "결과 다시 보기" 버튼으로 여는
 * CompletionCelebration이 이미 같은 역할을 한다.
 */
/**
 * 튜토리얼 안에서 쓰는 모달 두 종류(되돌아보기·단계 안내 팝업)가 같은 틀을 쓴다 — 완료 축하 모달
 * (CompletionCelebration)과도 같은 틀이다(어두운 배경·중앙 카드·ESC·바깥 클릭·X로 닫기).
 */
function TutorialModal({
  eyebrow,
  title,
  onClose,
  maxWidthClassName = 'max-w-lg',
  children,
}: {
  eyebrow: string
  title: string
  onClose: () => void
  maxWidthClassName?: string
  children: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      // CompletionCelebration(z-[70])보다는 아래, ConfirmDialog(z-[60])·SpotlightTour(z-50)보다는 위다 —
      // 셋 다 동시에 열릴 일은 없지만(완료 순간엔 다른 모달을 안 연다), 순서는 맞춰 둔다.
      className="fixed inset-0 z-[65] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full outline-none ${maxWidthClassName}`}
      >
        <Card innerClassName="p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium tracking-eyebrow text-muted">{eyebrow}</p>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="-mr-1 -mt-1 rounded-full p-2 text-muted transition hover:bg-white/[0.06] hover:text-ink"
            >
              <Close width={16} height={16} />
            </button>
          </div>
          <h2 id={titleId} className="mt-3 text-lg font-semibold leading-snug text-ink">
            {title}
          </h2>
          <div className="mt-4">{children}</div>
        </Card>
      </div>
    </div>
  )
}

function ReviewResultModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <TutorialModal eyebrow="실습 기록" title="되돌아보기" onClose={onClose}>
      {children}
    </TutorialModal>
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
 * 지금 들고 있는 수량 기준으로 두 기준선에 닿았을 때의 금액. -3%가 자기 돈으로 얼마인지 감이 없는
 * 초보자를 위한 것이라, 여기서는 **실제로 걸린 예약의 가격**을 그대로 써서 어림이 아니다.
 * 수량을 모르면(재시작 계정에서 실제로 null이 온다) 문장을 통째로 생략한다.
 */
function RiskAmountLine({
  entryPrice,
  plan,
  holdingQuantity,
}: {
  entryPrice: number
  plan: PracticeExitPlanSummary
  holdingQuantity: number | null
}) {
  if (holdingQuantity === null || holdingQuantity <= 0) return null
  const loss = (entryPrice - plan.stopLossPrice) * holdingQuantity
  const gain = (plan.takeProfitPrice - entryPrice) * holdingQuantity
  return (
    <p className="mt-4 text-sm leading-relaxed text-ink">
      지금 {holdingQuantity}개를 갖고 있으니, 손절선에 닿으면 약 {formatKRW(loss)}을 잃고 익절선에 닿으면 약{' '}
      {formatKRW(gain)}을 법니다. <span className="text-muted">수수료는 빼고 계산한 값입니다.</span>
    </p>
  )
}

/**
 * **예약을 실제로 건 뒤에만 그린다.** 2026-08-21 재설계로 매수 순간 서버가 자동으로 예약을 걸어 주던
 * 동작이 사라졌으므로, 예약 없이 이 카드를 그리면 "이 선에 닿으면 자동으로 팔립니다"가 거짓말이 된다
 * — 보유 중인데 예약이 없는 상태에서 화면이 해야 할 말은 이 카드가 아니라 `ExitJourneyGuide`의
 * "지금 예약을 걸어야 손절·익절을 겪습니다"다.
 */
function RiskEducationCard({
  market,
  entryPrice,
  plan,
  holdingQuantity,
}: {
  market: Market
  entryPrice: number | null
  plan: PracticeExitPlanSummary | null
  holdingQuantity: number | null
}) {
  if (plan === null || entryPrice === null) return null
  const risk = plan
  const labels = presetRateLabels(risk)
  /**
   * "열 번 중 몇 번만 맞아도 전체로는 손해를 보지 않는다"의 손익분기 승률. 사용자가 직접 정한 비율로
   * 계산하므로 손절을 익절보다 넓게 잡은 조합에서도 문구가 어긋나지 않는다.
   */
  const breakevenOutOfTen = Math.round(
    (risk.stopLossRate / (risk.stopLossRate + risk.takeProfitRate)) * 10,
  )
  return (
    <Card accent={market === 'CRYPTO' ? 'coin' : 'brand'} innerClassName="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">내가 건 예약</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">내가 산 값</dt>
          <dd className="mt-1 tabular text-base text-ink">{formatKRW(entryPrice)}</dd>
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
        {/*
          "자동으로 팔린다"는 말은 **예약을 건 지금만** 참이다. 예전에는 매수 순간 서버가 예약을 대신
          걸어 줘서 항상 참이었지만(2026-08-20 문구 수정), 2026-08-21 재설계로 예약은 사용자가 직접
          거는 것이 되었다 — 그래서 이 카드 자체가 예약이 있을 때만 렌더된다(위 가드).
        */}
        <p className="text-ink">
          직접 걸어 둔 예약이라 이 선에 닿으면 자동으로 팔립니다. 그 순간 손절 또는 익절로 정리돼요 —
          물론 그 전에 직접 팔아도 되고, 예약을 취소할 수도 있습니다.
        </p>
        <p>
          <span className="font-medium text-ink">손절선</span>은 "여기까지 내려가면 더 버티지 않고
          팔겠다"고 미리 정해두는 값입니다. 손실을 확정하는 대신 더 큰 손실을 막는 행동입니다.{' '}
          <span className="font-medium text-ink">익절선</span>은 "여기까지 오르면 욕심내지 않고 팔겠다"고
          정해두는 값입니다.
        </p>
        {/*
          폭의 뜻은 **사용자가 고른 조합**에 따라 달라진다. 예전에는 프리셋 셋 다 손절이 익절보다
          좁아서 "손실 쪽을 좁게 잡았습니다"를 무조건 적을 수 있었지만, 자유 입력에서는 손절 5·익절 3
          같은 조합도 그대로 저장되므로 그 문장이 거짓이 될 수 있다. 어느 쪽이든 손익분기 승률은
          실제 비율로 계산되니 그 숫자는 그대로 쓴다.
        */}
        <p>
          <span className="font-medium text-ink">
            왜 {labels.stopLoss}와 {labels.takeProfit}인가요.
          </span>{' '}
          {risk.stopLossRate < risk.takeProfitRate
            ? '손실 쪽을 이익 쪽보다 좁게 잡으셨습니다. 잃을 때는 작게 잃고 벌 때는 크게 번다는 뜻입니다.'
            : risk.stopLossRate > risk.takeProfitRate
              ? '이익 쪽을 손실 쪽보다 좁게 잡으셨습니다. 자주 이익을 챙기는 대신, 한 번 손절할 때 그만큼 크게 잃는다는 뜻입니다.'
              : '두 폭을 같게 잡으셨습니다. 잃을 때와 벌 때의 크기가 같다는 뜻입니다.'}{' '}
          이 조합이면 열 번 중 {breakevenOutOfTen}번만 맞아도 전체로는 손해를 보지 않습니다. 숫자 자체가
          정답인 건 아니지만 이 원칙은 어디서나 통합니다.
        </p>
        <p>예약을 건 시점의 산 값으로 정해진 뒤에는 가격이 움직여도 바뀌지 않습니다.</p>
      </div>
      <RiskAmountLine entryPrice={entryPrice} plan={risk} holdingQuantity={holdingQuantity} />
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

/**
 * 취소·정정하려던 주문이 그 사이 tick으로 이미 체결·취소돼 있으면 409(`ORDER_ALREADY_FILLED`·
 * `ORDER_ALREADY_CANCELLED`)나 404(`NOT_FOUND`)가 온다 — 오류가 아니라 "결말이 이미 났다"는
 * 뜻이다(실전 화면 `PendingOrders.tsx`의 `handleGone`과 같은 판단). 그런데 이 화면의 세 취소·정정
 * 경로(취소·즉시체결·정정)는 전부 이 경우를 일반 오류로만 보여주고 `pendingOrder`를 지우지
 * 않았다 — 카드가 "정한 값이 되기를 기다리는 중"에 영원히 멈춰, 다시 눌러도 같은 409만 반복됐다
 * (2026-08-20 실사용 중 발견). 체결가는 지정가로 고정되므로 `ORDER_ALREADY_FILLED`는 결말을
 * `FILLED`로 단정해도 된다.
 */
function pendingOrderGoneOutcome(error: unknown, pending: LimitOrderResponse): PendingOutcome | null {
  if (isApiErrorCode(error, 'ORDER_ALREADY_FILLED')) {
    return { status: 'FILLED', side: pending.side, quantity: pending.quantity, limitPrice: pending.limitPrice }
  }
  if (isApiErrorCode(error, 'ORDER_ALREADY_CANCELLED')) {
    return { status: 'CANCELLED', side: pending.side, quantity: pending.quantity, limitPrice: pending.limitPrice }
  }
  if (isApiErrorCode(error, 'NOT_FOUND')) {
    return { status: 'UNKNOWN', side: pending.side, quantity: pending.quantity, limitPrice: pending.limitPrice }
  }
  return null
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
  const [creatingExitPlan, setCreatingExitPlan] = useState(false)
  const [cancellingExitPlan, setCancellingExitPlan] = useState(false)
  /**
   * 예약 폼에 지금 적혀 있는 두 비율. **입력 상태를 이 컴포넌트가 들고 있는 이유는 차트 때문이다** —
   * 아직 걸지 않은 값도 차트에 점선으로 그려 줘야 "이 폭이면 금방 닿겠다"를 눈으로 판단할 수 있고,
   * 그 판단이 이 튜토리얼이 가르치려는 것이다. 초깃값은 서버가 들고 있는 비율(미선택이면 기본값 3·5)이다.
   */
  const [stopLossInput, setStopLossInput] = useState(() =>
    toRateInput(attempt.exitStopLossRate ?? FALLBACK_EXIT_RATES.stopLossRate),
  )
  const [takeProfitInput, setTakeProfitInput] = useState(() =>
    toRateInput(attempt.exitTakeProfitRate ?? FALLBACK_EXIT_RATES.takeProfitRate),
  )
  /**
   * 방금 건 예약을 서버 응답이 오기 전까지 화면이 대신 들고 있는 자리(`estimateExitPlan`). 진행 조회가
   * 아직 예약 정보를 안 내려주는 배포 전 상태에서도 "걸었다"가 화면에 남아야 하기 때문이다.
   * 서버가 값을 주면 언제나 서버가 이기고, 보유가 사라지면(체결·매도) 비운다.
   */
  const [localExitPlan, setLocalExitPlan] = useState<PracticeExitPlanSummary | null>(null)
  /** 이번 보유에서 예약을 걸었다가 취소한 적이 있는가. 취소가 조용히 끝나지 않게 하려는 표시다. */
  const [exitPlanCancelled, setExitPlanCancelled] = useState(false)
  const [advancingScript, setAdvancingScript] = useState(false)
  const [buyOrderType, setBuyOrderType] = useState<TutorialOrderType>('MARKET')
  const [buyLimitPrice, setBuyLimitPrice] = useState('')
  const [observing, setObserving] = useState(false)
  const [observeFailed, setObserveFailed] = useState(false)
  const [observeRetryNonce, setObserveRetryNonce] = useState(0)
  const [selling, setSelling] = useState(false)
  const [sellOrderType, setSellOrderType] = useState<TutorialOrderType>('MARKET')
  /**
   * 매도 탭이 "예약 매도"에 가 있는가. **`sellOrderType`에 세 번째 값을 넣지 않은 이유**는 그 상태가
   * 실제 매도 주문의 유형(시장가·지정가)이고 단계 잠금 effect 네 개가 그 값을 서로 밀어 주기 때문이다 —
   * 거기에 주문이 아닌 값을 섞으면 그 effect들이 예약 탭을 임의로 닫아 버린다.
   */
  const [reservedSellTabOpen, setReservedSellTabOpen] = useState(false)
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
  /** 지금 보유 중인가. 예약을 걸 수 있는지·학습 안내가 어느 칸에 서는지가 모두 이 값에서 갈린다. */
  const holdingNow = remainingQuantity !== null && remainingQuantity > 0
  /**
   * 샀는데 **수량을 모르는** 상태(재시작한 계정에서 서버가 실제로 이렇게 준다 — `buyDoneText` 주석).
   * 이때 학습 안내를 그리면 "먼저 삽니다"처럼 이미 지난 단계를 가리키게 되므로 통째로 생략한다.
   * 그 자리는 매도 버튼 아래의 "수량을 불러오지 못했습니다" 안내가 이미 맡고 있다.
   */
  const holdingQuantityUnknown = attempt.riskSnapshot !== null && remainingQuantity === null
  /**
   * 예약의 기준가(= 평균 매수가). **아직 안 판 진입의 체결가를 먼저 본다** — `riskSnapshot`은 전량
   * 매도해도 null로 돌아가지 않아서(위 orderSide 주석과 같은 이유) 그것만 보면 재진입 뒤에도 옛 값이
   * 남는다. 둘 다 없으면 null이고, 그때 화면은 가격·금액 줄을 통째로 생략한다.
   */
  const entryPrice =
    [...progress.entries].reverse().find((entry) => entry.sellAt === null)?.buyPrice ??
    attempt.riskSnapshot?.entryPrice ??
    null
  /**
   * 지금 걸려 있는 예약. 서버 값이 언제나 이기고, 서버가 아직 안 내려주는 동안만 방금 건 값을 쓴다
   * (`localExitPlan` 주석 참고).
   */
  const serverExitPlan = readPendingExitPlan(progress)
  const exitPlan = serverExitPlan ?? localExitPlan
  /** 이번 실행에서 손절·익절을 실제로 겪었는가(서버 판정 우선, 없으면 진입 기록의 매도 원인). */
  const exitExperience = readExitExperience(progress)
  /**
   * 지금 새 예약을 걸 수 있는가. **"보유 중이고 예약이 없다"로 대신 계산하지 않는다** — 예약은 한
   * 진입에 한 번뿐이라(백엔드 확정, write-once) 걸었다 취소한 진입은 그 조건을 만족하면서도 서버가
   * 409 `EXIT_PLAN_ALREADY_EXISTS`로 거부한다. 서버 판정이 없을 때만 어림한다.
   */
  const exitPlanCreatable = readExitPlanCreatable(progress, holdingNow && exitPlan === null)
  /**
   * 화면이 대신 들고 있던 예약을 비우는 두 조건. (1) 보유가 사라졌다 — 예약이 체결됐거나 직접 팔았다.
   * (2) 서버가 예약을 내려주기 시작했다 — 그때부터는 서버가 정본이다. 취소 표시도 보유가 끝나면
   * 함께 지운다(다음 진입은 새 이야기다).
   */
  useEffect(() => {
    if (!holdingNow || serverExitPlan !== null) setLocalExitPlan(null)
  }, [holdingNow, serverExitPlan])
  useEffect(() => {
    if (!holdingNow) setExitPlanCancelled(false)
  }, [holdingNow])
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
  /**
   * 대본이 끝나지 않은 동안의 전량 매도는 "끝"이 아니라 "다음 진입 전"이다(041, D35로 유보 해제·
   * D44로 범위 정정). **`scenarioStage`는 매도로 옮겨가지 않는다** — `PracticeScenarioProgressService`
   * 주석이 명시한다("표는 세 행뿐이고 매도는 어느 행에도 없다. 매도해도 커서를 옮기지 않는다"). ACT는
   * 보유 여부와 무관하게 시간으로만 흐르므로(`scenarioProgressing`이 "미보유로 4막을 관전 중이어도
   * true"), 손절·익절이 대본 커서보다 먼저 발동하면 `IDLE_REENTRY`에 닿기 한참 전(ACT1·ACT2 도중)에
   * 전량 매도 상태가 된다. **처음엔 `=== 'IDLE_REENTRY'`로만 판정했다가, 실사용에서 바로 이 이른
   * 손절 경로로 4단계(복기)에 떨어져 복기를 저장하면서 대본을 3·4막도 못 보고 조기 완료시키는 걸
   * 확인했다** — 그래서 "지금 이 값인가"가 아니라 "대본이 끝났는가"로 넓혔다. `FINISHED`·`null`
   * (대본 없음)이 아니면 전부 "아직 이야기가 안 끝났다"로 본다.
   */
  const awaitingReentry = scenarioStage !== null && scenarioStage !== 'FINISHED'
  /**
   * 사건 UI(속보 자막·사건 피드·상태 줄)를 그릴지의 판정(049, `frontend-reply-505.md` 결정 3).
   * **`ORDER_BASICS`는 이야기 UI 판정에서 `null`과 똑같이 취급한다** — 2단계 대본은 사건이 아예
   * 없어서(causeStatus 항상 NONE_KNOWN, revealedEvents 항상 빈 배열) 그 UI를 그대로 그리면
   * "다음 움직임을 기다리는 중입니다"처럼 내용 없는 줄만 계속 보인다. 대신 그 자리에 목적 설명
   * 한 줄(`OrderBasicsStatusLine`)을 둔다.
   */
  const storyUiActive = scenarioStage !== null && scenarioStage !== 'ORDER_BASICS'
  /**
   * 예약 매도 잠금(049 ORDERBASICS-015, `frontend-reply-505.md` 결정 1) — 두 조건 중 하나만
   * 맞아도 잠근다. **`ORDER_BASICS`는 왕복을 다 마쳤어도 무조건 잠근다** — 이건 서버 조건이 아니라
   * 화면의 결정이다. 2단계는 "주문 방법만 배우는 자리"라 손절·익절이 여기서 뜨면 3단계에서 처음 배울
   * 개념이 미리 등장해 버린다. **나머지(대본을 쓰는 실행에서 왕복 미완료)는 서버가 실제로 같은
   * 조건에서 409 `PRACTICE_STAGE_LOCKED`로 거부하는 방어선**이다 — 화면이 먼저 잠그지 않으면 눌러도
   * 통하지 않는 버튼이 된다. STOCK은 대본이 없어(scenarioStage 항상 null) 둘 다 적용되지 않는다.
   *
   * (이름은 옛 프리셋 시절의 `exitPresetStageLocked`에서 바꿨다 — 잠그는 대상이 프리셋 픽커가 아니라
   * 예약 매도 탭이 되었기 때문이다. 판정 자체는 그대로다.)
   */
  const exitPlanStageLocked =
    scenarioStage === 'ORDER_BASICS' ||
    (scenarioStage !== null &&
      !(progress.tutorialStageProgress.marketBuySellCompleted && progress.tutorialStageProgress.limitBuySellCompleted))
  /**
   * 지정가 토글 잠금(049 ORDERBASICS-015). 시장가 왕복을 마쳐야 지정가를 쓸 수 있다 — 프리셋과
   * 같은 근거·같은 서버 거부(`PRACTICE_STAGE_LOCKED`)라 판정만 다르다(시장가 왕복 하나만 본다).
   */
  const limitOrderStageLocked = scenarioStage !== null && !progress.tutorialStageProgress.marketBuySellCompleted
  /**
   * 시장가 토글 잠금 — 2단계(ORDER_BASICS)에서 시장가 왕복을 마쳤는데 지정가는 아직이면, 시장가를
   * 계속 눌러도 되는 자유 토글로 두지 않는다. 자유롭게 두면 시장가만 반복하고 지정가는 건너뛴 채
   * "다 했다"고 착각하기 쉽다(2026-08-21 피드백 — 실사용 중 시장가를 계속 누를 수 있어 지정가
   * 차례라는 걸 못 알아챘다). **3단계(스토리)에서는 걸지 않는다** — marketBuySellCompleted가 이미
   * 참이라 자연히 안 걸리지만, `scenarioStage === 'ORDER_BASICS'`로 한 번 더 범위를 못박는다. 서버
   * 쪽 강제는 없다(시장가 재주문 자체는 막을 이유가 없다) — 화면 전용 안내다.
   */
  const marketOrderStageLocked =
    scenarioStage === 'ORDER_BASICS' &&
    progress.tutorialStageProgress.marketBuySellCompleted &&
    !progress.tutorialStageProgress.limitBuySellCompleted
  /**
   * 잠긴 상태에서 지정가가 이미 골라져 있으면 시장가로 되돌린다 — 재시작은 `tutorialStageProgress`
   * 세 값을 전부 되돌리므로, 재시작 전에 지정가를 골라 뒀던 사용자가 재시작 뒤 "잠긴 채 선택된"
   * 상태로 보이는 걸 막는다.
   */
  useEffect(() => {
    if (limitOrderStageLocked && buyOrderType === 'LIMIT') setBuyOrderType('MARKET')
  }, [limitOrderStageLocked, buyOrderType])
  useEffect(() => {
    if (limitOrderStageLocked && sellOrderType === 'LIMIT') setSellOrderType('MARKET')
  }, [limitOrderStageLocked, sellOrderType])
  /** 시장가 차례가 지나 지정가 차례가 되면, 골라 둔 게 시장가여도 지정가로 밀어 준다(위와 대칭). */
  useEffect(() => {
    if (marketOrderStageLocked && buyOrderType === 'MARKET') setBuyOrderType('LIMIT')
  }, [marketOrderStageLocked, buyOrderType])
  useEffect(() => {
    if (marketOrderStageLocked && sellOrderType === 'MARKET') setSellOrderType('LIMIT')
  }, [marketOrderStageLocked, sellOrderType])
  /**
   * 예약 탭을 닫아야 하는 두 경우. 2단계로 돌아갔거나(재시작), 보유가 사라졌거나 — 둘 다 그 탭에서
   * 할 수 있는 일이 없다. 보유가 사라지면 화면은 어차피 매수 쪽으로 돌아가지만, 탭 상태를 켜 둔 채로
   * 두면 다시 사자마자 예약 탭이 열린 채로 나타나 매수 직후 화면이 낯설어진다.
   */
  useEffect(() => {
    if (exitPlanStageLocked || !holdingNow) setReservedSellTabOpen(false)
  }, [exitPlanStageLocked, holdingNow])
  /**
   * 2단계(ORDER_BASICS)의 "지금 할 일" 안내는 상시 카드로 두지 않는다 — 화면에 계속 붙어 있으면
   * 위 진행 로드맵(1~4단계)과 아래 체크리스트·주문 폼까지 겹쳐 "2단계 정보가 여러 곳에 흩어져
   * 헷갈린다"는 반응이 나왔다(2026-08-21 피드백). 그래서 그 차례에 들어선 순간 큰 팝업으로 한 번만
   * 띄우고, 닫으면 그 차례 동안은 다시 띄우지 않는다 — `dismissedGuideStep`이 "이 차례는 이미 봤다"를
   * 기억한다. 다음 차례(시장가 → 지정가)로 넘어가면 `guideStep`이 바뀌어 다시 한 번 뜬다.
   */
  const guideStep: 'market' | 'limit' | null =
    scenarioStage !== 'ORDER_BASICS' || market !== 'CRYPTO'
      ? null
      : !progress.tutorialStageProgress.marketBuySellCompleted
        ? 'market'
        : marketOrderStageLocked
          ? 'limit'
          : null
  const [dismissedGuideStep, setDismissedGuideStep] = useState<'market' | 'limit' | null>(null)
  const showGuidePopup = guideStep !== null && dismissedGuideStep !== guideStep
  /** 진행 조회의 사건 목록은 완료 후에도 남는다 — 차트가 없는 순간에도 결과 모달이 쓸 수 있다. */
  const revealedEvents =
    chart !== null && chart.revealedEvents.length > 0 ? chart.revealedEvents : progress.revealedEvents
  const saleDeadlineAt = evidence?.saleDeadlineAt ?? null

  /**
   * 이 화면이 사용자에게 보여 주는 4단계는 서버 chain의 단계 번호(progress.currentStep)와 대응하지
   * 않는다 — 서버 chain은 관심등록·매수의사까지 포함하지만 이 화면은 고르기·구매하기·지켜보기·
   * 판매하고 돌아보기로 다시 묶었다. 그래서 화면에 쓰는 번호는 attempt·evidence 상태에서 직접 만든다.
   *
   * **아래 두 조건은 orderSide·reviewReady(각각 뒤에서 정의)와 같은 판정을 미리 인라인으로 쓴 것이다**
   * — 값을 두 곳에서 따로 계산하면 어긋날 수 있어(D44가 바로 그렇게 생겼다) 나중에 두 변수를 고치면
   * 반드시 여기도 같이 고쳐야 한다. `replay || (fullySold && !awaitingReentry)`가 "끝"이고,
   * `riskSnapshot && !fullySold`가 "보유 중"이다. 재진입을 기다리는 동안(끝이 아닌데 fullySold)은
   * 다시 "구매하기"로 되돌아간다.
   */
  const uiStep =
    attempt.status === 'SELECTING_INSTRUMENT'
      ? 1
      : replay || (fullySold && !awaitingReentry)
        ? 4
        : attempt.riskSnapshot && !fullySold
          ? 3
          : 2
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
   * 예약 매도 걸기(2026-08-21 재설계). **매수 폼에서 미리 정하던 비율을 여기로 옮긴 것이 이번 변경의
   * 핵심이다** — 실전과 같은 순서(산다 → 예약을 건다)를 되찾기 위해서다. 서버가 보유 없음·중복 예약을
   * 거부하므로 화면도 같은 조건에서 버튼을 먼저 잠그되, 거부가 오면 서버 메시지를 그대로 보여준다.
   *
   * ⚠️ **두 값을 그대로 보낸다** — 손절도 양수 퍼센트 수다(3%는 `3`). 여기서 `-`를 붙이거나 100으로
   * 나누면 부호 반전·100배 오차가 조용히 난다.
   */
  const handleCreateExitPlan = useCallback(
    async (nextStopLossRate: number, nextTakeProfitRate: number) => {
      if (creatingExitPlan) return
      setCreatingExitPlan(true)
      clearError()
      try {
        await createPracticeExitPlan(market, nextStopLossRate, nextTakeProfitRate)
        /**
         * 진행 조회가 정본이지만, 그 응답에 예약 정보가 실려 오는 백엔드가 아직 배포 전이다.
         * 그동안은 방금 건 값을 화면이 들고 있는다 — 안 그러면 예약을 건 직후에도 "지금 예약을
         * 걸어야 합니다"가 계속 떠서 사용자가 두 번 건다(그리고 서버가 중복으로 거부한다).
         */
        if (entryPrice !== null) {
          setLocalExitPlan(estimateExitPlan(entryPrice, nextStopLossRate, nextTakeProfitRate))
        }
        setExitPlanCancelled(false)
        bumpTutorial()
        await onRefresh()
      } catch (error) {
        /**
         * `EXIT_PLAN_ALREADY_EXISTS`의 공용 문구는 "취소한 뒤 다시 시도해 주세요"인데, **튜토리얼에서는
         * 그게 거짓말이다** — 예약은 한 진입에 한 번뿐이라(백엔드 확정) 취소해도 같은 진입에서는 다시
         * 걸리지 않는다. 공용 문구는 실거래 OCO에서 맞는 말이므로 그쪽은 두고 여기서만 덮는다.
         */
        showError(
          'exitPlan',
          toUserMessage(error, {
            EXIT_PLAN_ALREADY_EXISTS:
              '이 진입에는 이미 예약을 걸었습니다. 취소한 예약도 같은 진입에서는 다시 걸 수 없어요 — 지금 가진 것을 팔고 다시 사면 새로 걸 수 있습니다.',
          }),
        )
      } finally {
        setCreatingExitPlan(false)
      }
    },
    [clearError, creatingExitPlan, entryPrice, market, onRefresh, showError],
  )

  /**
   * 예약 취소는 **실전과 같은 경로**(`DELETE /api/exit-plans/{id}`)를 쓴다 — 튜토리얼 전용 취소
   * 엔드포인트가 따로 없고, 만들 이유도 없다(예약 자체는 실전과 같은 레코드다).
   */
  const handleCancelExitPlan = useCallback(
    async (exitPlanId: number) => {
      if (cancellingExitPlan) return
      setCancellingExitPlan(true)
      clearError()
      try {
        await cancelExitPlan(exitPlanId)
        setLocalExitPlan(null)
        setExitPlanCancelled(true)
        bumpTutorial()
        await onRefresh()
      } catch (error) {
        showError('exitPlan', toUserMessage(error))
      } finally {
        setCancellingExitPlan(false)
      }
    },
    [cancellingExitPlan, clearError, onRefresh, showError],
  )

  /**
   * 2단계(주문 방법) 대본을 마친 실행을 3단계(041 이야기)로 전환한다(049 ORDERBASICS-018~021,
   * 이슈 #507). **응답 시점에는 대본 커서가 아직 안 바뀐다** — 서버가 커서를 `null`로 되돌려 두고
   * 다음 tick에서 3단계 첫 구간을 새로 열므로, 성공 직후 tick을 한 번 더 불러 새 `scenarioStage`를
   * 직접 반영한다(자연 폴링에 맡기면 최대 3초 동안 화면이 아직 2단계처럼 보인다).
   */
  const handleAdvanceScript = useCallback(async () => {
    if (advancingScript) return
    setAdvancingScript(true)
    clearError()
    try {
      const updated = await advancePracticeAttemptScript(market)
      onAttemptChange(updated)
      const nextChart = await tickPracticeAttempt(market)
      setChart(nextChart)
      bumpTutorial()
      await onRefresh()
    } catch (error) {
      showError('advance', toUserMessage(error))
    } finally {
      setAdvancingScript(false)
    }
  }, [advancingScript, clearError, market, onAttemptChange, onRefresh, showError])

  const handleBuy = useCallback(async () => {
    if (attempt.instrumentId === null) return
    const parsed = Number(buyQuantityInput)
    if (!(parsed > 0) || (market === 'STOCK' && !Number.isInteger(parsed))) {
      showError(
        'buy',
        market === 'STOCK'
          ? '주식은 1주 단위입니다. 1 이상의 정수로 적어 주세요.'
          : '원하는 금액을 적어 주세요.',
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
    const pending = pendingOrder
    setCancellingPending(true)
    clearError()
    try {
      await cancelLimitOrder(pending.orderId)
      setPendingOutcome({
        status: 'CANCELLED',
        side: pending.side,
        quantity: pending.quantity,
        limitPrice: pending.limitPrice,
      })
      setPendingOrder(null)
      setAmendOpen(false)
      await onRefresh()
    } catch (error) {
      const gone = pendingOrderGoneOutcome(error, pending)
      if (gone) {
        // 취소하려는 사이에 이미 결말이 났다 — 오류가 아니다. 카드를 그 결말로 바꾸고 다시 읽는다.
        setPendingOutcome(gone)
        setPendingOrder(null)
        setAmendOpen(false)
        await onRefresh()
        return
      }
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
    const pending = pendingOrder
    const parsedPrice = Number(amendPrice)
    const parsedQuantity = Number(amendQuantity)
    if (!(parsedPrice > 0) || !(parsedQuantity > 0)) {
      showError('pending', '바꿀 값과 개수를 0보다 크게 적어 주세요.')
      return
    }
    setAmending(true)
    clearError()
    try {
      const updated = await amendLimitOrder(pending.orderId, {
        limitPrice: amendPrice,
        quantity: amendQuantity,
      })
      setPendingOrder(updated)
      setAmendOpen(false)
      await onRefresh()
    } catch (error) {
      const gone = pendingOrderGoneOutcome(error, pending)
      if (gone) {
        // 고치려는 사이에 이미 결말이 났다 — 예전에는 메시지만 이름표를 달리 붙이고 카드를 그대로
        // "기다리는 중"에 남겨 뒀다. 그러면 다시 눌러도 같은 409만 반복된다(2026-08-20 실사용 중 발견).
        setPendingOutcome(gone)
        setPendingOrder(null)
        setAmendOpen(false)
        await onRefresh()
        return
      }
      showError('pending', toUserMessage(error))
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
    const pending = pendingOrder
    const side = pending.side
    const orderQuantity = String(pending.quantity)
    setCancellingPending(true)
    clearError()
    try {
      await cancelLimitOrder(pending.orderId)
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
      /**
       * "지금 값에 바로 체결" 버튼은 정한 값에 영영 안 닿아 지친 사용자를 위한 탈출로다 — 그런데
       * 취소를 부르는 그 사이에 진짜로 값이 닿아 서버가 먼저 체결시켜 버리면(정확히 그 버튼을
       * 누르고 싶어지는 순간과 같은 순간이다) `ORDER_ALREADY_FILLED` 409가 온다. 이미 산 걸 또
       * 사면 안 되므로 시장가 주문을 새로 넣지 않고, 이미 원하던 결과(체결)가 났다고 그대로 알린다
       * (2026-08-20 실사용 중 발견 — 지정가 매수 뒤 이 버튼을 눌렀는데 화면이 "기다리는 중"에
       * 멈춘 채 끝난 것으로 재현했다).
       */
      const gone = pendingOrderGoneOutcome(error, pending)
      if (gone) {
        setPendingOutcome(gone)
        setPendingOrder(null)
        setAmendOpen(false)
        if (gone.status === 'FILLED') {
          if (side === 'BUY') setBuyOrderType('MARKET')
          else setSellOrderType('MARKET')
        }
        await onRefresh()
        return
      }
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
   * 예약 입력창에 **처음 제안할** 비율(placeholder). 서버가 들고 있는 값이고, 아직 안 내려주면
   * 폴백으로 어림한다 — 미선택이면 서버 기본값 3·5가 온다.
   */
  const exitStopLossRate = attempt.exitStopLossRate ?? FALLBACK_EXIT_RATES.stopLossRate
  const exitTakeProfitRate = attempt.exitTakeProfitRate ?? FALLBACK_EXIT_RATES.takeProfitRate
  /** 입력 범위. 서버가 안 내려주는 동안만 폴백을 쓴다(FALLBACK_EXIT_RATE_BOUNDS 주석 참고). */
  const exitRateBounds = progress.exitRateBounds ?? FALLBACK_EXIT_RATE_BOUNDS
  /**
   * 예약 폼에 지금 적혀 있는 값 중 **유효한 것만** 숫자로. 차트의 예상선이 이 값을 따라간다 —
   * 범위를 벗어난 값으로 선을 그리면 걸 수도 없는 약속을 그리는 셈이 된다.
   */
  const draftStopLossRate =
    rateError(stopLossInput, exitRateBounds.stopLossMin, exitRateBounds.stopLossMax, '손절') === null
      ? Number(stopLossInput)
      : null
  const draftTakeProfitRate =
    rateError(takeProfitInput, exitRateBounds.takeProfitMin, exitRateBounds.takeProfitMax, '익절') === null
      ? Number(takeProfitInput)
      : null

  /**
   * 차트에 얹는 손절·익절선. **선은 예약을 따라간다** — 2026-08-21 재설계로 매수 순간 자동 예약이
   * 사라졌으므로, 예약이 없는데 선을 그리면 아무도 지키지 않을 약속을 그리는 것이 된다.
   *
   * 세 경우뿐이다. (1) 예약이 걸려 있으면 그 확정선. (2) 보유 중인데 아직 안 걸었으면 **지금 예약
   * 폼에 적힌 값으로 잡은 예상선** — 걸기 전에 그 폭이 최근 변동폭 대비 어디에 놓이는지 눈으로 보고
   * 판단하라는 자리이고, 이 튜토리얼이 가르치려는 판단이 정확히 그것이다. (3) 그 밖에는 안 그린다.
   *
   * 2단계(ORDER_BASICS)에는 아예 그리지 않는다 — 그 단계는 예약 자체를 다루지 않으므로
   * (049 ORDERBASICS-022) 선을 그리면 없는 약속을 하는 것이 된다.
   */
  const chartReferenceLines = useMemo((): { value: number; tone: 'gain' | 'loss'; label: string }[] | undefined => {
    if (scenarioStage === 'ORDER_BASICS') return undefined
    if (exitPlan) {
      const labels = presetRateLabels(exitPlan)
      return [
        { value: exitPlan.stopLossPrice, tone: 'loss', label: `손절 ${labels.stopLoss}` },
        { value: exitPlan.takeProfitPrice, tone: 'gain', label: `익절 ${labels.takeProfit}` },
      ]
    }
    if (!holdingNow || entryPrice === null) return undefined
    if (draftStopLossRate === null || draftTakeProfitRate === null) return undefined
    const labels = presetRateLabels({
      stopLossRate: draftStopLossRate,
      takeProfitRate: draftTakeProfitRate,
    })
    return [
      {
        value: entryPrice * (1 - draftStopLossRate / 100),
        tone: 'loss',
        label: `예상 손절 ${labels.stopLoss}`,
      },
      {
        value: entryPrice * (1 + draftTakeProfitRate / 100),
        tone: 'gain',
        label: `예상 익절 ${labels.takeProfit}`,
      },
    ]
  }, [draftStopLossRate, draftTakeProfitRate, entryPrice, exitPlan, holdingNow, scenarioStage])

  /**
   * 되돌아보기는 팔고 난 뒤에야 할 일이 생긴다. 그전에는 탭을 잠그고, 전량 매도되는 순간 자동으로
   * 넘어간다 — 안내형 흐름의 마지막 단계를 탭 뒤에 숨겨 두지 않기 위해서다. **재진입을 기다리는
   * 전량 매도는 예외다** — 그 순간 복기 패널로 넘기면 되돌릴 수 없는 조기 완료를 유도하게 되므로
   * (D35) 탭을 열지 않고 "주문" 탭에 남긴다. 거기서 orderSide가 다시 BUY로 바뀌어 재구매 폼을 보여준다.
   */
  const reviewReady = replay || (fullySold && !awaitingReentry)
  useEffect(() => {
    if (reviewReady) {
      setPanelTab('review')
      return
    }
    /**
     * 차트(scenarioStage)는 비동기로 늦게 도착한다 — 마운트 직후 한 틱 동안은 chart가 아직 null이라
     * awaitingReentry가 일시적으로 false로 계산돼(evidence만 먼저 fullySold=true) reviewReady가
     * 잠깐 true였다가 chart 로딩 후 false로 돌아오는 경우가 실제로 있다. 그때 위 분기가 이미
     * "review"로 넘겨 버린 뒤라, 재진입 상태로 확정되면 명시적으로 다시 "order"로 되돌린다 —
     * 안 그러면 잠금 풀린 적 없는 되돌아보기 탭 뒤에 사용자가 갇힌다.
     */
    if (awaitingReentry) setPanelTab('order')
  }, [awaitingReentry, reviewReady])

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

  /**
   * 지금 어느 쪽 주문을 하는 단계인지. 매수 전이면 매수, 산 뒤에는 매도다. **`riskSnapshot`은 전량
   * 매도해도 null로 돌아가지 않는다** — 그대로 두면 재진입 순간에도 계속 매도 화면이 떠서 다시 살
   * 방법이 없다(D35 이전까지의 실제 제약). 전량 매도된 상태(`fullySold`)에서는 다시 매수로 되돌린다.
   */
  const orderSide: OrderSide = attempt.riskSnapshot && !fullySold ? 'SELL' : 'BUY'

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

      <StageProgressChecklist
        market={market}
        progress={progress.tutorialStageProgress}
        exitPlanned={exitPlan !== null || exitExperience.stopLoss || exitExperience.takeProfit}
        autoStoppedThisRun={progress.entries.some(
          (entry) => entry.sellCause === 'STOP_LOSS' || entry.sellCause === 'TAKE_PROFIT',
        )}
      />

      {/*
        손절·익절 학습 흐름 안내 — 매수 폼이든 매도 폼이든 **항상 같은 자리에** 둔다. 지금 어느 칸에
        서 있는지(사기 → 예약 걸기 → 기다리기)와 이번 실행에서 무엇을 겪었는지가 계속 보여야 하기
        때문이다. 2단계(ORDER_BASICS)에는 그리지 않는다 — 그 단계는 예약을 다루지 않는다.
        주식(STOCK)에도 그리지 않는다 — 예약 매도 탭 자체가 코인 전용이라, 걸 방법이 없는 화면에서
        "예약을 걸어야 합니다"라고 말하면 오지 않을 일을 약속하는 것이 된다.
      */}
      {market === 'CRYPTO' && scenarioStage !== 'ORDER_BASICS' && !holdingQuantityUnknown && (
        <ExitJourneyGuide
          holdingQuantity={remainingQuantity}
          plan={exitPlan}
          canReserve={exitPlanCreatable}
          experience={exitExperience}
          hasTraded={progress.entries.length > 0}
          cancelledOnce={exitPlanCancelled}
          onOpenReservation={
            exitPlanCreatable && !exitPlanStageLocked ? () => setReservedSellTabOpen(true) : null
          }
        />
      )}

      {/*
        2→3단계 전환 CTA(049, frontend-reply-505.md 결정 2) — 사용자 버튼으로만 넘어간다. 되돌릴 수
        없는 확인창(재시작)과 달리 앞으로 나아가는 선택이라 톤을 다르게 뒀다 — 막는 어조가 아니라
        초대형 CTA. 보유 중에는 서버가 409로 거부하므로(순보유수량 > 0) `orderSide === 'BUY'`로
        먼저 가린다.
      */}
      {scenarioStage === 'ORDER_BASICS' &&
        orderSide === 'BUY' &&
        progress.tutorialStageProgress.marketBuySellCompleted &&
        progress.tutorialStageProgress.limitBuySellCompleted && (
          <div className="rounded-2xl border border-coin/30 bg-coin-soft/40 p-4">
            <p className="text-sm font-medium text-ink">시장가·지정가 매매를 모두 마쳤습니다.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              이제 사건이 있는 진짜 이야기로 넘어갈 수 있습니다. 손절·익절 프리셋을 고르고, 시세가
              왜 움직이는지 지켜보며 연습합니다.
            </p>
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={advancingScript}
              onClick={() => void handleAdvanceScript()}
            >
              {advancingScript ? '넘어가는 중…' : '3단계로 가기'}
            </Button>
            <ErrorNote error={flowError} scope="advance" />
          </div>
        )}

      {/*
        재진입을 기다리는 전량 매도(D35) — "끝"이 아니라 "다음 진입 전"이라는 걸 먼저 말해 준다.
        지난 진입 카드를 그대로 보여주면 방금 판 게 사라진 게 아니라 정리됐을 뿐이라는 게 눈에 보인다.
        **`orderSide === 'BUY'`가 반드시 있어야 한다** — 없으면 지금 한창 보유 중일 때도 "직전 진입이
        정리됐다"는 문구가 뜬다. `progress.entries`에는 아직 안 판 진입(현재 보유)도 들어 있어서
        `entries.length > 0`만으로는 "정리됐다"를 보장하지 못한다(2026-08-20 실사용 재확인 중 발견).
      */}
      {orderSide === 'BUY' && awaitingReentry && progress.entries.length > 0 && (
        <div className="rounded-2xl border border-line bg-elevated/60 p-4">
          <p className="text-sm font-medium text-ink">직전 진입이 정리됐습니다. 다시 살 수 있어요.</p>
          <div className="mt-3">
            <EntryComparison entries={progress.entries} layout="narrow" />
          </div>
        </div>
      )}

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
            {amountMode ? '2. 원하는 금액만큼 구매합니다 (매수)' : '2. 몇 개 구매할지 정합니다 (매수)'}
          </h2>
          <CurrentPriceBox price={latestPrice} note="3초마다 새로 불러옵니다." />
          {/*
            **매수 폼에는 손절·익절 입력이 없다.** 2026-08-21 재설계로 "매수할 때 미리 정해 두는 값"이
            아니라 "사고 나서 예약 매도로 직접 거는 것"이 되었기 때문이다(제품 오너 지적: 지금 3단계는
            매수할 때부터 예약매도가 떠 있어 실전 순서와 어긋난다). 여기서 빼야 매수 폼이 실전 매수
            폼과 같아지고, "예약 매도"라는 행위가 사라지지 않는다. 옮겨 간 자리는 아래 매도 쪽
            `TutorialExitPlanPanel`이다 — 범위 제한·의미 문구·예상 금액·차트 참고선도 함께 갔다.
          */}
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
                    disabled={
                      (type === 'LIMIT' && limitOrderStageLocked) ||
                      (type === 'MARKET' && marketOrderStageLocked)
                    }
                    onClick={() => setBuyOrderType(type)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring disabled:cursor-default disabled:opacity-40 ${
                      buyOrderType === type
                        ? 'bg-coin-soft text-coin ring-1 ring-coin/40'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {type === 'MARKET' ? '시장가' : '지정가'}
                  </button>
                ))}
              </div>
              {limitOrderStageLocked ? (
                <p className="text-xs leading-relaxed text-muted">
                  시장가로 먼저 한 번 사고팔아 본 뒤에 지정가를 쓸 수 있습니다.
                </p>
              ) : marketOrderStageLocked ? (
                <p className="text-xs leading-relaxed text-muted">
                  시장가는 다 해 봤습니다. 이번엔 지정가로 사고팔아 볼 차례입니다.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  시장가는 지금 값에 바로 구매합니다(처음이라면 이걸 추천합니다). 지정가는 원하는 값이 될
                  때까지 기다립니다.
                </p>
              )}
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
                "주문 가능" 박스·퍼센트 버튼(10/25/50/75/최대)도 실전과 같은 자리·같은 비율이다
                (이슈 #502로 해소, 9차 E 유보 해제). `attempt.tutorialAvailableCash`는 쓰기 응답
                네 곳에서만 실값이 온다 — Tutorial.tsx가 그 값을 상태로 들고 있다가 이 prop으로
                내려주므로, 여기서는 그대로 받아 쓰면 된다(로컬로 다시 조회하지 않는다).
              */}
              <p className="mb-1.5 text-sm font-medium text-ink">주문 가능</p>
              <div className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] tabular">
                <span className="text-ink">{formatKRW(attempt.tutorialAvailableCash)}</span>
              </div>
              <label
                htmlFor="tutorial-buy-amount"
                className="mb-1.5 mt-3 block text-sm font-medium text-ink"
              >
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
              <div
                role="group"
                aria-label="가진 돈의 비율로 금액 채우기"
                className="mt-2 flex flex-wrap items-center justify-end gap-1.5"
              >
                {[0.1, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    disabled={attempt.tutorialAvailableCash <= 0}
                    onClick={() => {
                      const amt =
                        ratio >= 1 ? attempt.tutorialAvailableCash : attempt.tutorialAvailableCash * ratio
                      setBuyAmount(String(Math.floor(amt)))
                    }}
                    className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-muted"
                  >
                    {ratio < 1 ? `${ratio * 100}%` : '최대'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                코인은 개수가 아니라 금액으로 삽니다. 실전 화면도 같은 방식이에요.
              </p>
              {/* 실전 화면(pages/Trade.tsx)과 같은 수수료 안내 — 입력한 금액 그대로 코인이 사지는
                  게 아니라 수수료만큼 빠진 나머지로 산다는 걸 숫자로 바로 보여준다. */}
              {buyAmountNumber > 0 && buyUnitPrice !== null && buyQuantityNumber > 0 && (
                <div className="mt-3 space-y-1.5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-200/80">실제 매수 금액 (수수료 제외)</span>
                    <span className="font-medium text-ink tabular">
                      {formatKRW(buyUnitPrice * buyQuantityNumber)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-200/80">
                      수수료 ({(FEE_RATE.CRYPTO * 100).toFixed(2)}%)
                    </span>
                    <span className="text-ink tabular">
                      {formatKRW(buyUnitPrice * buyQuantityNumber * FEE_RATE.CRYPTO)}
                    </span>
                  </div>
                  <p className="pt-1 text-xs leading-relaxed text-amber-200/70">
                    입력한 {formatKRW(buyAmountNumber)} 중 수수료를 뺀{' '}
                    {formatKRW(buyUnitPrice * buyQuantityNumber)}만큼만 실제{' '}
                    {selectedInstrument?.symbol ?? '코인'} 매수에 쓰여요. 그래서 최소 주문금액에 딱
                    맞춰 입력하면 수수료만큼 모자라 주문이 안 될 수 있어요.
                  </p>
                </div>
              )}
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
          {/*
            매수 전 "손절선에 닿으면 얼마를 잃는다" 미리보기도 함께 뺐다(옛 `BuyRiskPreviewLine`).
            예약을 걸기 전에는 그런 선이 존재하지 않으므로 매수 시점에 그 금액을 말하면 없는 약속이
            된다. 같은 계산은 예약 폼(`ExitRateFields`) 안에서, 실제로 걸 값과 보유 수량 기준으로 한다.
          */}
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
                모의투자 화면(pages/Trade.tsx)의 매도는 시장가·지정가·예약 매도 세 탭이다. **세 번째
                탭이 이번에 실제로 켜졌다** — 예전에는 매수 순간 서버가 손절·익절을 자동으로 걸어 줘서
                사용자가 걸 것이 없었고(TUTORIAL-FLOW-008) 그래서 비활성이었는데, 2026-08-21 재설계로
                예약을 직접 거는 것이 이 단계의 학습 목표가 되었다. 이제 잠기는 경우는 2단계
                (ORDER_BASICS)뿐이고, 그때는 아래에 이유 한 줄을 함께 둔다.
              */}
              <div className="flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
                {(['MARKET', 'LIMIT'] as const).map((type) => {
                  const active = !reservedSellTabOpen && sellOrderType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={active}
                      disabled={
                        (type === 'LIMIT' && limitOrderStageLocked) ||
                        (type === 'MARKET' && marketOrderStageLocked)
                      }
                      onClick={() => {
                        setReservedSellTabOpen(false)
                        setSellOrderType(type)
                      }}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring disabled:cursor-default disabled:opacity-40 ${
                        active ? 'bg-coin-soft text-coin ring-1 ring-coin/40' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {type === 'MARKET' ? '시장가' : '지정가'}
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-pressed={reservedSellTabOpen}
                  disabled={exitPlanStageLocked}
                  aria-describedby={exitPlanStageLocked ? reservedSellNoteId : undefined}
                  onClick={() => setReservedSellTabOpen(true)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-400 ease-spring disabled:cursor-default disabled:opacity-40 ${
                    reservedSellTabOpen
                      ? 'bg-coin-soft text-coin ring-1 ring-coin/40'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  예약 매도
                </button>
              </div>
              {limitOrderStageLocked && !reservedSellTabOpen && (
                <p className="text-xs leading-relaxed text-muted">
                  시장가로 먼저 한 번 사고팔아 본 뒤에 지정가를 쓸 수 있습니다.
                </p>
              )}
              {exitPlanStageLocked && (
                <p id={reservedSellNoteId} className="text-xs leading-relaxed text-muted">
                  예약 매도는 손절·익절 가격을 미리 걸어두는 기능입니다. 지금은 주문 방법을 배우는
                  단계라, 다음 단계에서 직접 걸어 봅니다.
                </p>
              )}
            </>
          )}
          {reservedSellTabOpen ? (
            <>
              <TutorialExitPlanPanel
                bounds={exitRateBounds}
                plan={exitPlan}
                entryPrice={entryPrice}
                holdingQuantity={remainingQuantity}
                stopLossInput={stopLossInput}
                takeProfitInput={takeProfitInput}
                onStopLossInputChange={setStopLossInput}
                onTakeProfitInputChange={setTakeProfitInput}
                suggestedStopLossRate={exitStopLossRate}
                suggestedTakeProfitRate={exitTakeProfitRate}
                stageLocked={exitPlanStageLocked}
                canReserve={exitPlanCreatable}
                submitting={creatingExitPlan}
                cancelling={cancellingExitPlan}
                cancelledOnce={exitPlanCancelled}
                onSubmit={(stopLoss, takeProfit) => void handleCreateExitPlan(stopLoss, takeProfit)}
                onCancel={(exitPlanId) => void handleCancelExitPlan(exitPlanId)}
              />
              <ErrorNote error={flowError} scope="exitPlan" />
              {/* 예약 탭에서도 그냥 팔고 싶을 수 있다 — 되돌아갈 길을 막지 않는다. */}
              <button
                type="button"
                onClick={() => setReservedSellTabOpen(false)}
                className="text-xs text-muted underline underline-offset-4 transition-colors hover:text-ink"
              >
                예약하지 않고 지금 팔기
              </button>
            </>
          ) : (
            <>
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
              {/*
                **예약 없이 그냥 파는 것도 허용한다(강제 강도 b) — 다만 침묵하지 않는다.** 지금 팔면
                무엇을 건너뛰는지 한 줄로 말해 준다. 2단계(예약 자체가 없는 단계)와 주식에는 붙이지
                않는다 — 걸 방법이 없는 화면에서 "예약해 두면"이라고 말하면 오지 않을 일을 권하는 것이다.
              */}
              {market === 'CRYPTO' &&
                !exitPlanStageLocked &&
                exitPlanCreatable &&
                exitPlan === null &&
                holdingNow &&
                !sellLocked && (
                  <p className="text-xs leading-relaxed text-muted">
                    지금 팔면 직접 판 것이라 손절·익절은 겪지 않습니다. "예약 매도"로 걸어 두면 값이 선에
                    닿는 순간 자동으로 정리되는 것을 겪어 볼 수 있어요.
                  </p>
                )}
              <ErrorNote error={flowError} scope="sell" />
            </>
          )}
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
          <p className="text-xs text-muted">{REFLECTION_QUESTION}</p>
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
          {REFLECTION_QUESTION}
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
        2단계(ORDER_BASICS)도 사건이 없어 자연히 안 뜨지만, storyUiActive로 명시적으로 뺀다.
      */}
      {storyUiActive && <BreakingNewsCrawl market={market} events={revealedEvents} />}

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
            {storyUiActive && (
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
                  {/*
                    폭에서 나오는 16:9 비율로 높이가 정해진다 — 바닥값을 둬서 좁은 창에서도 안 접힌다.
                    예전엔 21:9(옆으로 납작)라 차트가 시각적으로 덜 부각돼 보인다는 피드백으로 16:9로
                    올렸다(2026-08-21). 실전 화면(pages/Trade.tsx)도 같은 비율로 함께 올렸다 — 둘이
                    다른 비율을 쓰면 튜토리얼에서 익힌 화면이 실전에서 낯설어진다.
                  */}
                  <div className="flex aspect-[16/9] min-h-[240px] flex-col">
                    <CandleChart
                      candles={candles}
                      interval="1d"
                      maxBars={30}
                      fillHeight
                      showVolume={false}
                      beginnerLabels
                      describedById={chartSummaryId}
                      emptyMessage="차트를 불러오는 중입니다."
                      referenceLines={chartReferenceLines}
                    />
                  </div>
                  <div>
                    {/* 기준선 요약도 **예약이 있을 때만** 말한다 — 차트 참고선과 같은 이유다. */}
                    <ChartSummary
                      latestPrice={latestPrice}
                      high={chartHigh}
                      low={chartLow}
                      dayCount={chart?.candles.length ?? 0}
                      entryPrice={entryPrice}
                      stopLossPrice={exitPlan?.stopLossPrice ?? null}
                      takeProfitPrice={exitPlan?.takeProfitPrice ?? null}
                    />
                    {/*
                      전체 사건 목록은 왼쪽 컬럼(ScenarioEventFeed)에 있다 — 낮은 화면에서는 차트
                      자체가 세로 공간을 다 먹어 여기 두면 다시 스크롤 밖으로 밀린다(2026-08-20
                      피드백). 여기는 "지금 상태 + 왼쪽을 보라"는 한 줄만 남긴다. 대본이 없는
                      실행에서는 통째로 빠진다 — 빈 줄을 남기면 "곧 뭔가 온다"는 약속이 된다.
                    */}
                    {scenarioStage !== null && scenarioStage !== 'ORDER_BASICS' && (
                      <ScenarioStatusLine
                        market={market}
                        stage={scenarioStage}
                        progressing={chart?.scenarioProgressing ?? null}
                        causeStatus={chart?.causeStatus ?? null}
                      />
                    )}
                    {scenarioStage === 'ORDER_BASICS' && (
                      <OrderBasicsStatusLine market={market} priceGuideRange={chart?.priceGuideRange ?? null} />
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
            <RiskEducationCard
              market={market}
              entryPrice={entryPrice}
              plan={exitPlan}
              holdingQuantity={remainingQuantity}
            />
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
              {/*
                진행 중인 실행의 되돌아보기(복기 입력)는 이 좁은 탭이 아니라 아래 큰 모달로 연다 —
                replay(완료 기록 다시 보기)만 예외로 이 자리에 그대로 남긴다("결과 다시 보기" 버튼이
                이미 CompletionCelebration으로 그 모달을 연다).
              */}
              <div className="p-5">
                {panelTab === 'review' && replay ? reviewPanelBody : orderPanelBody}
              </div>
            </Card>

            {/* celebrating이면 완료 축하 모달(z-[70])이 대신 뜬다 — 둘이 겹치면 role="dialog"가
                두 개가 되어 스크린리더도 테스트도 어느 쪽을 봐야 할지 알 수 없다. */}
            {panelTab === 'review' && !replay && !celebrating && (
              <ReviewResultModal onClose={() => setPanelTab('order')}>{reviewPanelBody}</ReviewResultModal>
            )}

            {/*
              2단계(ORDER_BASICS) "지금 할 일" 팝업 — 그 차례에 들어선 순간 한 번만 뜬다. 되돌아보기
              모달·축하 모달과 동시에 뜰 일은 실질적으로 없지만(둘 다 ORDER_BASICS를 벗어난 뒤의
              상태다), 혹시 겹쳐도 role="dialog"가 하나만 남도록 같은 조건으로 가린다.
            */}
            {showGuidePopup && panelTab === 'order' && !celebrating && (
              <TutorialModal
                eyebrow="2단계 · 주문 방법 연습"
                title={guideStep === 'market' ? '지금 할 일 · 시장가로 사고팔아 보기' : '지금 할 일 · 지정가로 사고팔아 보기'}
                onClose={() => setDismissedGuideStep(guideStep)}
                maxWidthClassName="max-w-sm"
              >
                <p className="text-sm leading-relaxed text-muted">
                  {guideStep === 'market'
                    ? '아래에서 시장가로 한 번 사고, 한 번 팔아 보세요. 다 팔면 이 항목이 끝납니다.'
                    : '시장가는 다 했습니다. 이번엔 지정가로 한 번 사고, 한 번 팔아 보세요.'}
                </p>
                <Button
                  type="button"
                  className="mt-4 w-full"
                  onClick={() => setDismissedGuideStep(guideStep)}
                >
                  확인했어요
                </Button>
              </TutorialModal>
            )}

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
