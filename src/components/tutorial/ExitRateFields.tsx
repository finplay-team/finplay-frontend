// 예약 매도에 걸 손절·익절 비율을 각각 자유 입력하는 두 칸 (실전 예약 매도 탭과 같은 모양·같은 규칙)
import { cleanDecimal } from '../trade/OcoExitPlanPanel'
import { formatKRW } from '../../lib/format'
import type { ExitRateBounds } from '../../services/tutorialTypes'

/**
 * 서버가 `exitRateBounds`를 아직 안 내려줄 때만 쓰는 **폴백**이다 — 계약상 손절 2~5·익절 3~8이고
 * 기존 세 프리셋(2/3·3/5·5/8)의 최솟값·최댓값을 그대로 경계로 삼은 값이다. 서버가 범위를 바꾸면
 * 이 숫자는 틀리므로, 응답에 범위가 실려 오면 **언제나 응답 쪽이 이긴다**.
 *
 * ⚠️ **네 경계 중 조여 있는 것은 익절 하한 하나뿐이다.** 3을 대략 1.8 아래로 내리면 041 대본 1막에서
 * 익절이 먼저 터져 "손절을 먼저 겪는" 학습 순서가 깨진다(여유 0.96%p, 백엔드 전수 조사). 나머지 셋은
 * 여유가 크다 — 익절 상한은 15.8까지, 손절 상한은 13.1까지 올려도 여전히 닿는다. 어느 쪽이 조여 있는지
 * 모르면 다음 사람이 엉뚱한 경계를 조심하게 되므로 함께 적어 둔다. 경계를 바꾸는 정본은 서버가
 * 내려주는 `exitRateBounds`이고, 익절 하한만은 그때도 대본을 다시 훑어 본 뒤라야 한다.
 */
export const FALLBACK_EXIT_RATE_BOUNDS: ExitRateBounds = {
  stopLossMin: 2,
  stopLossMax: 5,
  takeProfitMin: 3,
  takeProfitMax: 8,
}

/**
 * 예약 입력창의 **초깃값**으로 쓰는 폴백이다 — 서버가 `exitStopLossRate`·`exitTakeProfitRate`를 아직
 * 안 내려줄 때만 쓴다. 계약상 미선택 기본값이 손절 3·익절 5다.
 */
export const FALLBACK_EXIT_RATES = { stopLossRate: 3, takeProfitRate: 5 }

/**
 * ⚠️ **입력창의 placeholder로 범위의 하한을 제안하지 않는다.** 네 경계 중 익절 하한(3)만 여유가 얇다 —
 * 백엔드가 041 대본을 0.1%p 간격 전수(1,581조합)로 훑어 본 결과, 구간 안에서는 손절·익절이 100%
 * 도달하고 1막에서 익절이 먼저 터지는 조합이 하나도 없어 "손절을 먼저 겪는" 학습 순서가 보장되는데,
 * **그 여유가 0.96%p뿐이다**(1막 고점 1.018 대 가장 좁은 익절선 1.02794). 화면이 하한 근처를 권하면
 * 사용자를 그 얇은 가장자리로 몰게 된다. placeholder는 처음 제안값(서버가 들고 있는 값)만 되비춘다.
 */

/** 서버가 받는 정밀도. 소수 둘째 자리부터는 서버가 거부하므로 입력 단계에서 자른다. */
const RATE_DECIMALS = 1

/** 두 입력창이 같은 정제 규칙을 쓰도록 한 곳에서 내보낸다(실전 `cleanDecimal`을 그대로 재사용한다). */
export function cleanRateInput(raw: string): string {
  return cleanDecimal(raw, RATE_DECIMALS)
}

/** 3 → "3", 3.5 → "3.5". 소수 첫째 자리가 0이면 붙이지 않는다. */
export function toRateInput(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/**
 * 입력 한 칸의 유효성. **범위 숫자는 인자로만 들어온다** — 여기에 2~5를 적어 두면 서버가 범위를
 * 바꿨을 때 화면만 옛 범위로 남는다. 반환값이 null이면 예약을 걸어도 되는 값이다.
 */
export function rateError(raw: string, min: number, max: number, name: string): string | null {
  if (raw.trim() === '') return `${name} 비율을 입력해 주세요.`
  const value = Number(raw)
  if (!Number.isFinite(value)) return `${name} 비율을 숫자로 입력해 주세요.`
  if (value < min || value > max) return `${name} 비율은 ${min}%에서 ${max}% 사이로 정해 주세요.`
  if (Math.round(value * 10) !== value * 10) return '소수 첫째 자리까지만 정할 수 있습니다.'
  return null
}

/**
 * 지금 고른 폭이 범위 안에서 어디쯤인가. 그 자리에 따라 폭의 성질을 말로 돌려주기 위한 것이라
 * 경계 숫자가 아니라 **비율 위치**로 판단한다 — 서버가 범위를 바꿔도 문구가 어긋나지 않는다.
 */
function widthBand(value: number, min: number, max: number): 'narrow' | 'middle' | 'wide' {
  const span = max - min
  if (!(span > 0)) return 'middle'
  const position = (value - min) / span
  if (position <= 1 / 3) return 'narrow'
  if (position >= 2 / 3) return 'wide'
  return 'middle'
}

/**
 * 폭이 뜻하는 바를 한 줄로 돌려준다. 프리셋 이름(조심스럽게·보통·느긋하게)이 하던 교육적 역할을
 * 이름 대신 **설명**으로 대신하는 자리다 — 빈 숫자 칸만 남으면 사용자는 아무 숫자나 넣고 왜 그
 * 숫자인지 모른 채 지나간다.
 *
 * 어느 폭이 옳다고 말하지 않는다. 좁으면 좁은 대로, 넓으면 넓은 대로 무엇을 얻고 무엇을 내주는지
 * 양쪽을 함께 적는다 — 손절 폭은 정답이 아니라 성향의 선택이라는 게 이 튜토리얼이 가르치려는 것이다.
 */
function stopLossMeaning(band: 'narrow' | 'middle' | 'wide'): string {
  if (band === 'narrow') {
    return '좁게 잡았습니다. 작은 흔들림에도 금방 닿아 일찍 정리되고, 한 번에 잃는 금액은 그만큼 작습니다.'
  }
  if (band === 'wide') {
    return '넓게 잡았습니다. 큰 하락까지 버티는 대신, 닿았을 때 잃는 금액은 그만큼 큽니다.'
  }
  return '중간쯤으로 잡았습니다. 웬만한 흔들림은 버티고, 그보다 큰 하락에서 정리됩니다.'
}

function takeProfitMeaning(band: 'narrow' | 'middle' | 'wide'): string {
  if (band === 'narrow') {
    return '좁게 잡았습니다. 조금만 올라도 팔려서 자주 닿는 대신, 한 번에 버는 금액은 그만큼 작습니다.'
  }
  if (band === 'wide') {
    return '넓게 잡았습니다. 크게 오를 때까지 기다리는 대신, 거기까지 오르지 않으면 팔리지 않습니다.'
  }
  return '중간쯤으로 잡았습니다. 어느 정도 오르기를 기다렸다가 정리합니다.'
}

interface Props {
  bounds: ExitRateBounds
  /** 지금 화면에 적힌 값. **상태는 부모가 들고 있다** — 차트 참고선도 같은 값을 따라가야 하기 때문이다. */
  stopLossInput: string
  takeProfitInput: string
  onStopLossInputChange: (next: string) => void
  onTakeProfitInputChange: (next: string) => void
  /** 처음 제안값(서버가 들고 있는 비율). placeholder로만 쓴다 — 범위의 하한을 권하지 않는다. */
  suggestedStopLossRate: number
  suggestedTakeProfitRate: number
  disabled: boolean
  /**
   * 기준가 — 실전 예약 매도와 같이 **평균 매수가**다(현재가가 아니다). 예약은 산 값을 기준으로
   * 걸리므로, 여기에 현재가를 넣으면 화면이 말하는 선과 서버가 만드는 선이 어긋난다.
   * 모르면 가격·금액 줄을 통째로 생략한다.
   */
  basePrice: number | null
  /** 지금 보유 수량. 0이면 금액을 말하지 않는다 — "0원을 잃습니다"는 거짓 문장이다. */
  quantity: number
}

/**
 * 실전 화면(`trade/OcoExitPlanPanel.tsx`)의 예약 매도 탭 "비율(%)" 모드를 그대로 본떴다 — 라벨
 * ("손절 비율 (−%)"·"익절 비율 (+%)"), 오른쪽 정렬 tabular 입력, `%` 접미사, 아래에 붙는 기준가
 * 한 줄까지 같은 자리·같은 모양이다. 여기서 익힌 조작이 실전에서 그대로 통해야 하기 때문이다.
 *
 * 실전과 다른 점은 둘뿐이다. (1) 범위를 서버가 준 `bounds`로 막는다. (2) 폭의 뜻을 말로 돌려준다.
 * **예약을 거는 버튼은 이 컴포넌트가 아니라 감싸는 패널(`TutorialExitPlanPanel`)에 있다** — 실전과
 * 같은 "정하고 → 건다"의 순서를 지키기 위해서다. 값이 바뀌는 즉시 저장하지 않는다.
 */
export function ExitRateFields({
  bounds,
  stopLossInput,
  takeProfitInput,
  onStopLossInputChange,
  onTakeProfitInputChange,
  suggestedStopLossRate,
  suggestedTakeProfitRate,
  disabled,
  basePrice,
  quantity,
}: Props) {
  const stopLossErrorText = rateError(stopLossInput, bounds.stopLossMin, bounds.stopLossMax, '손절')
  const takeProfitErrorText = rateError(
    takeProfitInput,
    bounds.takeProfitMin,
    bounds.takeProfitMax,
    '익절',
  )

  /**
   * 아래 줄들은 **저장된 값이 아니라 지금 화면에 적힌 값**을 따라간다 — 숫자를 바꾸는 동안 그 폭이
   * 무슨 뜻인지 즉시 보여야 하기 때문이다. 유효하지 않은 값은 계산하지 않는다.
   */
  const stopLossNumber = stopLossErrorText === null ? Number(stopLossInput) : null
  const takeProfitNumber = takeProfitErrorText === null ? Number(takeProfitInput) : null
  const stopLossPrice =
    basePrice !== null && stopLossNumber !== null ? basePrice * (1 - stopLossNumber / 100) : null
  const takeProfitPrice =
    basePrice !== null && takeProfitNumber !== null ? basePrice * (1 + takeProfitNumber / 100) : null

  const inputClass =
    'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 disabled:opacity-50'

  return (
    <div data-tour="exit-rates" className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="tutorial-stop-loss-rate" className="text-sm font-medium text-loss">
            손절 비율 (−%)
          </label>
          <span className="text-[11px] text-muted tabular">
            {bounds.stopLossMin}~{bounds.stopLossMax}% 중에서
          </span>
        </div>
        <div className="mt-1.5 flex gap-2">
          <input
            id="tutorial-stop-loss-rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            placeholder={toRateInput(suggestedStopLossRate)}
            value={stopLossInput}
            onChange={(e) => onStopLossInputChange(cleanRateInput(e.target.value))}
            className={`${inputClass} focus:border-loss focus:ring-4 focus:ring-loss/15`}
          />
          <span className="self-center text-sm text-muted">%</span>
        </div>
        {stopLossErrorText !== null ? (
          <p className="mt-1.5 text-[11px] text-loss">{stopLossErrorText}</p>
        ) : (
          <>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {stopLossMeaning(widthBand(stopLossNumber as number, bounds.stopLossMin, bounds.stopLossMax))}
            </p>
            {stopLossPrice !== null && (
              <p className="mt-1 text-[11px] text-muted tabular">
                {formatKRW(stopLossPrice)}에 닿으면 자동으로 정리됩니다
                {quantity > 0 &&
                  ` — 지금 가진 수량이면 약 ${formatKRW(((basePrice as number) - stopLossPrice) * quantity)}을 잃습니다`}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="tutorial-take-profit-rate" className="text-sm font-medium text-gain">
            익절 비율 (+%)
          </label>
          <span className="text-[11px] text-muted tabular">
            {bounds.takeProfitMin}~{bounds.takeProfitMax}% 중에서
          </span>
        </div>
        <div className="mt-1.5 flex gap-2">
          <input
            id="tutorial-take-profit-rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            placeholder={toRateInput(suggestedTakeProfitRate)}
            value={takeProfitInput}
            onChange={(e) => onTakeProfitInputChange(cleanRateInput(e.target.value))}
            className={`${inputClass} focus:border-gain focus:ring-4 focus:ring-gain/15`}
          />
          <span className="self-center text-sm text-muted">%</span>
        </div>
        {takeProfitErrorText !== null ? (
          <p className="mt-1.5 text-[11px] text-loss">{takeProfitErrorText}</p>
        ) : (
          <>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {takeProfitMeaning(
                widthBand(takeProfitNumber as number, bounds.takeProfitMin, bounds.takeProfitMax),
              )}
            </p>
            {takeProfitPrice !== null && (
              <p className="mt-1 text-[11px] text-muted tabular">
                {formatKRW(takeProfitPrice)}에 닿으면 자동으로 정리됩니다
                {quantity > 0 &&
                  ` — 지금 가진 수량이면 약 ${formatKRW((takeProfitPrice - (basePrice as number)) * quantity)}을 법니다`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
