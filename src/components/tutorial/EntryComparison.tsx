// 완료 화면의 진입별 대조 카드 — 실제 손익과 "안 팔았다면"을 나란히 그린다
import { formatKRW, formatSignedKRW, pnlTone } from '../../lib/format'
import type { PracticeEntryResponse, PracticeSellCause } from '../../services/tutorialTypes'

/**
 * 그 진입의 손절·익절 기준을 **사용자가 직접 넣은 숫자 그대로** 되돌려 준다(2026-08-21 재설계).
 * 예전에는 프리셋 이름(조심스럽게·보통·느긋하게)을 그렸는데, 이제 이름을 고르는 자리가 없어져
 * **사용자가 본 적 없는 말**이 됐다. 자기가 넣은 숫자를 다시 보는 편이 학습에도 맞다.
 *
 * 부호는 입력 화면(ExitRateFields)과 같은 톤으로 붙인다 — 손절은 −, 익절은 +.
 */
function exitRateChipText(stopLossRate: number, takeProfitRate: number): string {
  return `손절 −${stopLossRate}% · 익절 +${takeProfitRate}%`
}

/**
 * 진입별 비율 필드가 아직 응답에 없을 때만 쓰는 **폴백**이다 — 서버가 그 비율로 만든 기준선
 * 가격에서 되돌려 계산한다(진입가 대비 몇 %인가). 소수 첫째 자리까지만 남기는 것은 서버가 받는
 * 정밀도와 같다. 응답에 비율이 실려 오면 **언제나 응답 쪽이 이긴다**.
 */
function rateFromPrices(entryPrice: number, linePrice: number): number {
  if (!(entryPrice > 0)) return 0
  return Math.round((Math.abs(linePrice - entryPrice) / entryPrice) * 1000) / 10
}

/**
 * `MANUAL`은 "사용자가 직접 팔았다"는 뜻이다. 예약이 가리키지 않는 매도는 전부 여기 들어가므로
 * 예약 자체가 없는 주식 튜토리얼도 MANUAL이다 — "예약이 안 걸렸다"는 식으로 읽히는 말을 쓰지 않는다.
 */
const CAUSE_LABEL: Record<PracticeSellCause, string> = {
  STOP_LOSS: '손절로 팔림',
  TAKE_PROFIT: '익절로 팔림',
  MANUAL: '직접 팔았습니다',
}

const CAUSE_TONE: Record<PracticeSellCause, string> = {
  STOP_LOSS: 'border-loss/40 bg-loss/10 text-loss',
  TAKE_PROFIT: 'border-gain/40 bg-gain/10 text-gain',
  MANUAL: 'border-line bg-elevated text-muted',
}

/** 그 진입을 연 매수의 주문 유형(이슈 #505) — "이 진입은 시장가로 열었다"는 것만 말한다. */
const ORDER_TYPE_LABEL: Record<PracticeEntryResponse['buyOrderType'], string> = {
  MARKET: '시장가 매수',
  LIMIT: '지정가 매수',
}

/**
 * 2단계(주문 방법 학습, ORDER_BASICS)에서 연 진입만 표시한다(049 "5-A", 이슈 #512) — 3단계(이야기)
 * 진입이 다수라 그쪽에 칩을 또 붙이면 "당연한 걸 왜 매번 말하나"가 된다. `null`(대본 없음)·
 * `CRYPTO_STORY_V1`은 칩을 안 붙인다.
 */
const SCENARIO_SCRIPT_LABEL: Partial<Record<NonNullable<PracticeEntryResponse['scenarioScriptId']>, string>> = {
  CRYPTO_ORDER_BASICS_V1: '2단계 연습',
}

/** 코인은 소수 수량이 나온다 — 반올림해 "0개"라고 말하지 않도록 자리를 살린다. */
function formatQuantity(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

function Chip({ tone, children }: { tone: string; children: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{children}</span>
  )
}

function EntryCard({ entry }: { entry: PracticeEntryResponse }) {
  const sold = entry.sellPrice !== null && entry.sellQuantity !== null
  /**
   * 부분 매도한 진입에서는 아래 두 금액이 **판 수량 기준**이라 산 수량과 다르다. 두 금액을 전체 매수
   * 수량의 것으로 읽으면 틀리므로, 다를 때는 라벨과 별개로 한 줄을 더 붙여 밝힌다.
   */
  const partial =
    sold && entry.sellQuantity !== null && Math.abs(entry.sellQuantity - entry.buyQuantity) > 1e-8

  return (
    <article className="rounded-2xl border border-line bg-elevated/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{entry.entrySequence}번째 진입</p>
        <div className="flex flex-wrap gap-1.5">
          {entry.scenarioScriptId !== null && SCENARIO_SCRIPT_LABEL[entry.scenarioScriptId] && (
            <Chip tone="border-coin/40 bg-coin-soft text-coin">
              {SCENARIO_SCRIPT_LABEL[entry.scenarioScriptId] as string}
            </Chip>
          )}
          <Chip tone="border-line bg-elevated text-muted">{ORDER_TYPE_LABEL[entry.buyOrderType]}</Chip>
          <Chip tone="border-line bg-elevated text-muted">
            {exitRateChipText(
              entry.stopLossRate ?? rateFromPrices(entry.buyPrice, entry.stopLossPrice),
              entry.takeProfitRate ?? rateFromPrices(entry.buyPrice, entry.takeProfitPrice),
            )}
          </Chip>
          {entry.sellCause !== null && (
            <Chip tone={CAUSE_TONE[entry.sellCause]}>{CAUSE_LABEL[entry.sellCause]}</Chip>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted tabular">
        <span className="text-ink">{formatKRW(entry.buyPrice)}</span>에{' '}
        {formatQuantity(entry.buyQuantity)}개를 샀고
        {sold ? (
          <>
            {' '}
            <span className="text-ink">{formatKRW(entry.sellPrice as number)}</span>에{' '}
            {formatQuantity(entry.sellQuantity as number)}개를 팔았습니다.
          </>
        ) : (
          <> 아직 팔지 않았습니다.</>
        )}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted tabular">
        기준선은 손절 {formatKRW(entry.stopLossPrice)} · 익절 {formatKRW(entry.takeProfitPrice)}이었습니다.
      </p>

      {sold && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-elevated px-3 py-2.5">
            <p className="text-[11px] text-muted">실제 손익{partial ? ' (판 만큼)' : ''}</p>
            <p className={`mt-0.5 tabular text-lg font-semibold ${pnlTone(entry.realizedPnl ?? 0)}`}>
              {entry.realizedPnl === null ? '-' : formatSignedKRW(entry.realizedPnl)}
            </p>
          </div>
          {/*
            대본을 쓰지 않는 실행은 서버가 이 값을 주지 않는다(priceAfterSell이 null이라 계산 자체가 없다).
            그때는 칸을 통째로 뺀다 — 빈 칸을 남기면 "0원"이나 "계산 중"으로 읽힌다. **2단계(ORDER_BASICS)
            진입도 값이 와도 뺀다** — "안 팔았다면"은 손절·익절을 지켰어야 했다는 3단계 교훈용 비교이고,
            2단계는 자동 청산 자체가 없어(049 ORDERBASICS-022) 이 비교가 가리키는 교훈이 성립하지 않는다.
            그냥 사고파는 연습 한 번에 이 카드가 붙으면 "왜 여기서 손실 얘기가 나오지"로 헷갈린다
            (2026-08-21 피드백).
          */}
          {entry.unrealizedPnlIfHeld !== null &&
            entry.scenarioScriptId !== 'CRYPTO_ORDER_BASICS_V1' && (
            <div className="rounded-xl border border-dashed border-line px-3 py-2.5">
              <p className="text-[11px] text-muted">안 팔았다면</p>
              <p className={`mt-0.5 tabular text-lg font-semibold ${pnlTone(entry.unrealizedPnlIfHeld)}`}>
                {formatSignedKRW(entry.unrealizedPnlIfHeld)}
              </p>
            </div>
          )}
        </div>
      )}

      {/*
        익절로 팔렸는데 "안 팔았다면"이 더 크면 이 카드는 숫자만으로 **정반대 교훈**을 가르친다 —
        "규칙을 지켜서 손해 봤다"로 읽힌다(2026-08-21 실사용에서 +403,171원 옆에 +761,192원이 뜬 것을
        확인). 숫자를 숨기지는 않는다. 숨기면 유리할 때만 보여주는 셈이고 그건 이 화면이 가르치려는
        정직함과 어긋난다. 대신 **규칙이 무엇과 무엇을 맞바꾸는지**를 한 줄로 말한다.
      */}
      {sold &&
        entry.sellCause === 'TAKE_PROFIT' &&
        entry.realizedPnl !== null &&
        entry.unrealizedPnlIfHeld !== null &&
        entry.unrealizedPnlIfHeld > entry.realizedPnl && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          이번에는 더 오를 수도 있었습니다. 규칙은 최고점을 맞히는 약속이 아니라, 정한 만큼을 지키는
          약속이에요.
        </p>
      )}

      {partial && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          이 진입은 일부만 팔았습니다. 위 두 금액은 판 수량 기준입니다.
        </p>
      )}
    </article>
  )
}

/**
 * 진입별 대조 목록.
 *
 * **재진입한 사용자는 카드가 두 장이고 각각 손절·익절로 다르게 보인다** — 실행 전체 합(`tradeResult`)만
 * 그리던 시절에는 첫 매도 하나만 보여서 "2막에서 손절당하고 3막에서 익절한" 이야기가 사라졌다.
 *
 * `layout`은 자리 폭만 정한다. wide는 완료 결과 모달(가로 2열), narrow는 되돌아보기 탭(세로 스택)이다.
 */
export function EntryComparison({
  entries,
  layout,
}: {
  entries: PracticeEntryResponse[]
  layout: 'wide' | 'narrow'
}) {
  if (entries.length === 0) return null
  return (
    <div className={layout === 'wide' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
      {entries.map((entry) => (
        <EntryCard key={entry.entrySequence} entry={entry} />
      ))}
    </div>
  )
}
