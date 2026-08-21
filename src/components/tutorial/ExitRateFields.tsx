// 튜토리얼 3단계에서 손절·익절 비율을 각각 자유 입력하는 카드 (실전 예약 매도 탭과 같은 방식)
import { useEffect, useRef, useState } from 'react'
import { cleanDecimal } from '../trade/OcoExitPlanPanel'
import { formatKRW } from '../../lib/format'
import type { ExitRateBounds } from '../../services/tutorialTypes'

/**
 * 서버가 `exitRateBounds`를 아직 안 내려줄 때만 쓰는 **폴백**이다 — 계약상 손절 2~5·익절 3~8이고
 * 기존 세 프리셋(2/3·3/5·5/8)의 최솟값·최댓값을 그대로 경계로 삼은 값이다. 서버가 범위를 바꾸면
 * 이 숫자는 틀리므로, 응답에 범위가 실려 오면 **언제나 응답 쪽이 이긴다**.
 *
 * ⚠️ **익절 하한 3을 임의로 낮추지 않는다.** 대략 1.8% 아래로 내려가면 041 대본 1막에서 익절이 먼저
 * 터져 "손절을 먼저 겪는" 학습 순서가 깨진다(백엔드 전수 조사). 낮춰야 한다면 서버가 `exitRateBounds`로
 * 내려주는 값을 바꾸는 것이 정본이고, 그때도 대본을 다시 훑어 본 뒤라야 한다.
 */
export const FALLBACK_EXIT_RATE_BOUNDS: ExitRateBounds = {
  stopLossMin: 2,
  stopLossMax: 5,
  takeProfitMin: 3,
  takeProfitMax: 8,
}

/**
 * 서버가 `exitStopLossRate`·`exitTakeProfitRate`를 아직 안 내려줄 때만 쓰는 **폴백**이다 — 계약상
 * 미선택 기본값이 손절 3·익절 5다. 응답에 값이 있으면 언제나 응답 쪽이 이긴다.
 */
export const FALLBACK_EXIT_RATES = { stopLossRate: 3, takeProfitRate: 5 }

/**
 * ⚠️ **입력창의 placeholder로 범위의 하한을 제안하지 않는다.** 특히 익절 하한(3)은 여유가 얇다 —
 * 백엔드가 041 대본을 0.1%p 간격 전수(1,581조합)로 훑어 본 결과, 구간 안에서는 손절·익절이 100%
 * 도달하고 1막에서 익절이 먼저 터지는 조합이 하나도 없어 "손절을 먼저 겪는" 학습 순서가 보장되는데,
 * **그 여유가 0.96%p뿐이다**(1막 고점 1.018 대 가장 좁은 익절선 1.02794). 화면이 하한 근처를 권하면
 * 사용자를 그 얇은 가장자리로 몰게 된다. placeholder는 지금 저장된 값을 되비추는 데만 쓴다.
 */

/** 서버가 받는 정밀도. 소수 둘째 자리부터는 서버가 거부하므로 입력 단계에서 자른다. */
const RATE_DECIMALS = 1
/** 입력이 멎은 뒤 저장까지 기다리는 시간(ms). 한 글자마다 PUT을 보내지 않기 위한 것이다. */
const SAVE_DEBOUNCE_MS = 500

/** 3 → "3", 3.5 → "3.5". 소수 첫째 자리가 0이면 붙이지 않는다. */
function toRateInput(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/**
 * 입력 한 칸의 유효성. **범위 숫자는 인자로만 들어온다** — 여기에 2~5를 적어 두면 서버가 범위를
 * 바꿨을 때 화면만 옛 범위로 남는다. 반환값이 null이면 저장해도 되는 값이다.
 */
function rateError(raw: string, min: number, max: number, name: string): string | null {
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
  /** 서버가 지금 들고 있는 값(퍼센트 수, 둘 다 양수). 미선택이면 서버 기본값이 온다. */
  stopLossRate: number
  takeProfitRate: number
  /** 지금 보유 중인가. 보유 중에는 서버도 거부하므로 화면에서 먼저 막고 이유를 보여준다. */
  holdingLocked: boolean
  /** 2단계(주문 방법 학습)라 아직 다룰 자리가 아닌가. */
  stageLocked: boolean
  saving: boolean
  /** 어림 기준선을 그릴 현재가. 모르면 가격·금액 줄을 생략한다. */
  latestPrice: number | null
  /** 지금 매수 폼에 적힌 수량. 0이면 금액을 말하지 않는다 — "0원을 잃습니다"는 거짓 문장이다. */
  quantity: number
  onCommit: (stopLossRate: number, takeProfitRate: number) => void
}

/**
 * 실전 화면(`trade/OcoExitPlanPanel.tsx`)의 예약 매도 탭 "비율(%)" 모드를 그대로 본떴다 — 라벨
 * ("손절 비율 (−%)"·"익절 비율 (+%)"), 오른쪽 정렬 tabular 입력, `%` 접미사, 아래에 붙는 기준가
 * 한 줄까지 같은 자리·같은 모양이다. 여기서 익힌 조작이 실전에서 그대로 통해야 하기 때문이다.
 *
 * 실전과 다른 점은 셋뿐이다. (1) 범위를 서버가 준 `bounds`로 막는다. (2) 폭의 뜻을 말로 돌려준다.
 * (3) 예약을 거는 버튼이 없다 — 튜토리얼은 매수 체결 순간 서버가 이 비율로 자동 예약을 걸어 주므로
 * 값이 바뀌면 곧바로 저장한다(프리셋을 누르면 바로 저장되던 것과 같은 감각이다).
 */
export function ExitRateFields({
  bounds,
  stopLossRate,
  takeProfitRate,
  holdingLocked,
  stageLocked,
  saving,
  latestPrice,
  quantity,
  onCommit,
}: Props) {
  const [stopLossInput, setStopLossInput] = useState(() => toRateInput(stopLossRate))
  const [takeProfitInput, setTakeProfitInput] = useState(() => toRateInput(takeProfitRate))
  const locked = holdingLocked || stageLocked

  // 서버 값이 밖에서 바뀌면(재시작·다른 응답) 입력창을 그 값으로 되돌린다.
  useEffect(() => setStopLossInput(toRateInput(stopLossRate)), [stopLossRate])
  useEffect(() => setTakeProfitInput(toRateInput(takeProfitRate)), [takeProfitRate])

  const stopLossErrorText = rateError(stopLossInput, bounds.stopLossMin, bounds.stopLossMax, '손절')
  const takeProfitErrorText = rateError(
    takeProfitInput,
    bounds.takeProfitMin,
    bounds.takeProfitMax,
    '익절',
  )

  /**
   * 저장은 입력이 멎은 뒤에 한 번만 보낸다. 두 값이 **모두** 유효할 때만 보내는 이유는 서버가 한 번의
   * 요청으로 둘을 함께 받기 때문이다 — 한쪽이 비어 있는 동안 보내면 멀쩡한 다른 쪽까지 400이 된다.
   */
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  useEffect(() => {
    if (locked || stopLossErrorText || takeProfitErrorText) return
    const nextStopLoss = Number(stopLossInput)
    const nextTakeProfit = Number(takeProfitInput)
    if (nextStopLoss === stopLossRate && nextTakeProfit === takeProfitRate) return
    const timer = setTimeout(() => onCommitRef.current(nextStopLoss, nextTakeProfit), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [
    locked,
    stopLossErrorText,
    stopLossInput,
    stopLossRate,
    takeProfitErrorText,
    takeProfitInput,
    takeProfitRate,
  ])

  /**
   * 아래 줄들은 **저장된 값이 아니라 지금 화면에 적힌 값**을 따라간다 — 숫자를 바꾸는 동안 그 폭이
   * 무슨 뜻인지 즉시 보여야 하기 때문이다. 유효하지 않은 값은 계산하지 않는다.
   */
  const stopLossNumber = stopLossErrorText === null ? Number(stopLossInput) : null
  const takeProfitNumber = takeProfitErrorText === null ? Number(takeProfitInput) : null
  const stopLossPrice =
    latestPrice !== null && stopLossNumber !== null ? latestPrice * (1 - stopLossNumber / 100) : null
  const takeProfitPrice =
    latestPrice !== null && takeProfitNumber !== null
      ? latestPrice * (1 + takeProfitNumber / 100)
      : null

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
            disabled={locked}
            placeholder={toRateInput(stopLossRate)}
            value={stopLossInput}
            onChange={(e) => setStopLossInput(cleanDecimal(e.target.value, RATE_DECIMALS))}
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
                지금 값이면 약 {formatKRW(stopLossPrice)}에 정리됩니다
                {quantity > 0 &&
                  ` — 지금 적은 수량이면 약 ${formatKRW(((latestPrice as number) - stopLossPrice) * quantity)}을 잃습니다`}
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
            disabled={locked}
            placeholder={toRateInput(takeProfitRate)}
            value={takeProfitInput}
            onChange={(e) => setTakeProfitInput(cleanDecimal(e.target.value, RATE_DECIMALS))}
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
                지금 값이면 약 {formatKRW(takeProfitPrice)}에 정리됩니다
                {quantity > 0 &&
                  ` — 지금 적은 수량이면 약 ${formatKRW((takeProfitPrice - (latestPrice as number)) * quantity)}을 법니다`}
              </p>
            )}
          </>
        )}
      </div>

      {/* 두 비율은 서로 독립이다 — 손절 5% + 익절 3% 같은 조합도 그대로 저장된다. */}
      {stageLocked ? (
        <p className="text-[11px] leading-relaxed text-muted">
          이 단계는 주문 방법을 배우는 자리라 손절·익절은 다음 단계에서 다룹니다. 시장가·지정가를 먼저
          왕복해 보세요.
        </p>
      ) : holdingLocked ? (
        <p className="text-[11px] leading-relaxed text-muted">
          지금은 보유 중이라 바꿀 수 없습니다. 값이 내려가는 중에 손절선을 같이 내리면 미리 정해 둔
          기준이 의미를 잃기 때문입니다 — 다 판 뒤에 다시 정할 수 있어요.
        </p>
      ) : (
        saving && <p className="text-[11px] text-muted">저장하는 중…</p>
      )}
    </div>
  )
}
