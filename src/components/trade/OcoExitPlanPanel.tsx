// 코인 holding에 손절·익절(OCO) 예약을 걸거나, 걸어둔 예약을 확인·취소하는 패널 (021 일반 리스크관리 OCO)
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { QuantityPresets } from './QuantityPresets'
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey'
import { isApiErrorCode, toUserMessage } from '../../lib/errorMessages'
import { cancelExitPlan, createExitPlan, getExitPlans } from '../../services/exitPlanService'
import type { ExitPlanResponse, Holding } from '../../services/types'

const QTY_DECIMALS = 8
/** 손절·익절 비율 프리셋 — 두 방향 다 같은 퍼센트를 쓴다(2026-08-19 피드백). */
const PERCENT_PRESETS = ['5', '10', '15']

interface Props {
  /** 선택한 종목의 holding. 보유하지 않은 종목은 null — 이 경우 예약을 걸 수 없다. */
  holding: Holding | null
  /** 종목 전환 등 외부 사건이 있을 때 올려 주면 즉시 다시 읽는다. */
  refreshNonce: number
  /** 생성·취소가 성공하면 부모가 계좌·보유를 다시 읽어야 한다 (예약수량이 응답에 실려 오지 않는다). */
  onChanged: () => void
}

/** 8자리 초과·음수·중복 소수점을 입력 단계에서 잘라낸다 (서버는 400을 낸다). */
function cleanDecimal(raw: string, maxFractionDigits = QTY_DECIMALS): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    const [whole, frac = ''] = cleaned.split('.')
    cleaned = `${whole}.${frac.slice(0, maxFractionDigits)}`
  }
  return cleaned
}

function toQtyInput(value: number): string {
  return value
    .toFixed(QTY_DECIMALS)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: QTY_DECIMALS })
}

function formatKRW(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

/** 손절가·익절가 입력창에 천단위 콤마를 붙여 보여준다 — 저장값은 콤마 없는 원본 그대로 둔다. */
function formatPriceInput(raw: string): string {
  if (raw === '') return ''
  const [intPart, frac] = raw.split('.')
  const withCommas = Number(intPart || '0').toLocaleString('ko-KR')
  return frac !== undefined ? `${withCommas}.${frac}` : withCommas
}

export function OcoExitPlanPanel({ holding, refreshNonce, onChanged }: Props) {
  const [plan, setPlan] = useState<ExitPlanResponse | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const [quantity, setQuantity] = useState('')
  /** 손절·익절 기준을 비율(%)로 정할지 직접 금액(원)으로 정할지 — 서버 exitPriceType 과 그대로 대응한다. */
  const [priceMode, setPriceMode] = useState<'PERCENT' | 'PRICE'>('PERCENT')
  const [stopLossPercent, setStopLossPercent] = useState('')
  const [takeProfitPercent, setTakeProfitPercent] = useState('')
  const [stopLossPrice, setStopLossPrice] = useState('')
  const [takeProfitPrice, setTakeProfitPrice] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successNonce, setSuccessNonce] = useState(0)

  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const available = holding ? Math.max(0, holding.quantity - holding.reservedQuantity) : 0

  const load = useCallback(async () => {
    if (!holding) {
      setPlan(null)
      return
    }
    try {
      const page = await getExitPlans('PENDING')
      setPlan(page.content.find((p) => p.holdingId === holding.holdingId) ?? null)
      setListError(null)
    } catch (e) {
      setListError(toUserMessage(e))
    }
  }, [holding])

  useEffect(() => {
    void load()
  }, [load, refreshNonce])

  // holding이 바뀌거나 기존 예약이 사라지면 수량을 보유 가능 수량으로 다시 채운다.
  useEffect(() => {
    if (holding && !plan) setQuantity(toQtyInput(available))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding?.holdingId, plan])

  const quantityNumber = quantity === '' ? 0 : Number(quantity)
  const stopLossNumber = stopLossPercent === '' ? 0 : Number(stopLossPercent)
  const takeProfitNumber = takeProfitPercent === '' ? 0 : Number(takeProfitPercent)
  const stopLossPriceNumber = stopLossPrice === '' ? 0 : Number(stopLossPrice)
  const takeProfitPriceNumber = takeProfitPrice === '' ? 0 : Number(takeProfitPrice)

  const previewStopLossPrice =
    holding && stopLossNumber > 0 ? holding.averagePrice * (1 - stopLossNumber / 100) : null
  const previewTakeProfitPrice =
    holding && takeProfitNumber > 0 ? holding.averagePrice * (1 + takeProfitNumber / 100) : null

  const disableReason: string | null = !holding
    ? '이 종목을 보유해야 손절·익절을 예약할 수 있습니다.'
    : available <= 0
      ? '예약 가능한 수량이 없습니다 (전량 예약 중이거나 미보유).'
      : quantityNumber <= 0
        ? '수량을 입력해 주세요.'
        : quantityNumber > available
          ? `보유 가능 수량을 초과했습니다. (가능 ${formatQty(available)})`
          : priceMode === 'PERCENT'
            ? stopLossNumber <= 0
              ? '손절 비율을 입력해 주세요.'
              : stopLossNumber >= 100
                ? '손절 비율은 100%보다 작아야 합니다.'
                : takeProfitNumber <= 0
                  ? '익절 비율을 입력해 주세요.'
                  : null
            : stopLossPriceNumber <= 0
              ? '손절가를 입력해 주세요.'
              : takeProfitPriceNumber <= 0
                ? '익절가를 입력해 주세요.'
                : null

  const idempotencyKey = useIdempotencyKey([
    holding?.holdingId,
    quantity,
    priceMode,
    stopLossPercent,
    takeProfitPercent,
    stopLossPrice,
    takeProfitPrice,
    successNonce,
  ])

  const handleQuantityChange = (raw: string) => {
    const cleaned = cleanDecimal(raw)
    if (cleaned !== '' && Number(cleaned) > available) {
      setQuantity(toQtyInput(available))
      return
    }
    setQuantity(cleaned)
  }

  const handleSubmit = useCallback(async () => {
    if (!holding || disableReason) return
    setSubmitting(true)
    setFormError(null)
    try {
      await createExitPlan(
        {
          holdingId: holding.holdingId,
          quantity,
          ...(priceMode === 'PERCENT'
            ? { exitPriceType: 'PERCENT', stopLossRate: stopLossPercent, takeProfitRate: takeProfitPercent }
            : { exitPriceType: 'PRICE', stopLoss: stopLossPrice, takeProfit: takeProfitPrice }),
        },
        idempotencyKey,
      )
      setSuccessNonce((n) => n + 1)
      setStopLossPercent('')
      setTakeProfitPercent('')
      setStopLossPrice('')
      setTakeProfitPrice('')
      await load()
      onChanged()
    } catch (e) {
      if (isApiErrorCode(e, 'IDEMPOTENCY_CONFLICT')) setSuccessNonce((n) => n + 1)
      setFormError(toUserMessage(e))
    } finally {
      setSubmitting(false)
    }
  }, [
    disableReason,
    holding,
    idempotencyKey,
    load,
    onChanged,
    priceMode,
    quantity,
    stopLossPercent,
    stopLossPrice,
    takeProfitPercent,
    takeProfitPrice,
  ])

  const handleCancel = useCallback(async () => {
    if (!plan || cancelBusy) return
    setCancelBusy(true)
    setCancelError(null)
    try {
      await cancelExitPlan(plan.id)
      await load()
      onChanged()
    } catch (e) {
      setCancelError(toUserMessage(e))
    } finally {
      setCancelBusy(false)
    }
  }, [cancelBusy, load, onChanged, plan])

  return (
    <div className="rounded-2xl border border-line p-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">예약 매도</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {/* 새 예약을 거는 중(!plan)이고 비율 모드일 때만 "비율"로 부른다 — 이미 걸린 예약은 항상
              구체적인 가격으로 보여주므로 "가"로 고정한다(2026-08-19 피드백, B안). */}
          {!plan && priceMode === 'PERCENT' ? '손절 비율·익절 비율' : '손절가·익절가'} 중 먼저 닿는
          쪽으로 자동 매도되고, 나머지 하나는 자동 취소돼요. 종목당 예약은 1개까지예요.
        </p>

        {listError && <p className="mt-3 text-sm text-loss">{listError}</p>}

        {/* 손절·익절 기준을 비율(%)로 정할지 직접 금액(원)으로 정할지 — 이미 걸린 예약을 보는
            중엔 의미가 없어 새로 예약을 거는 폼(!plan)에서만 보여준다(2026-08-19 피드백). */}
        {!plan && (
          <div className="mt-3 flex w-full items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
            {(
              [
                ['PERCENT', '비율 (%)'],
                ['PRICE', '금액 (원)'],
              ] as const
            ).map(([value, label]) => {
              const active = priceMode === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriceMode(value)}
                  aria-pressed={active}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-400 ease-spring ${
                    active ? 'bg-white/[0.1] text-ink ring-1 ring-white/[0.14]' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {plan ? (
          <div className="mt-4 rounded-xl bg-elevated p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-4 text-xs">
                <span className="text-loss">손절 {formatKRW(plan.stopLossPrice)}</span>
                <span className="text-gain">익절 {formatKRW(plan.takeProfitPrice)}</span>
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={cancelBusy} onClick={() => void handleCancel()}>
                {cancelBusy ? '취소 중…' : '예약 취소'}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              예약 수량 {formatQty(plan.quantity)} · 기준가(평균매수가) {formatKRW(plan.entryPrice)}
            </p>
            {cancelError && <p className="mt-2 text-xs text-loss">{cancelError}</p>}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor="oco-quantity" className="text-sm font-medium text-ink">
                  수량
                </label>
                <span className="text-xs text-muted tabular">가능 {formatQty(available)}</span>
              </div>
              <input
                id="oco-quantity"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={!holding || available <= 0}
                placeholder="0.001"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-50"
              />
              {/* 시장가/지정가 매도 폼과 같은 퍼센트 프리셋 — SELL 은 가격이 필요 없어 held(=available)
                  비율만으로 채운다(2026-08-19 피드백). */}
              <QuantityPresets
                side="SELL"
                isCrypto
                availableCash={null}
                held={available}
                unitPrice={null}
                disabledReason={null}
                onPick={(qty) => setQuantity(toQtyInput(qty))}
              />
            </div>

            {priceMode === 'PERCENT' ? (
              <>
            <div>
              <label htmlFor="oco-stop-loss" className="text-sm font-medium text-loss">
                손절 비율 (−%)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="oco-stop-loss"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={!holding || available <= 0}
                  placeholder="10"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(cleanDecimal(e.target.value, 4))}
                  className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-loss focus:ring-4 focus:ring-loss/15 disabled:opacity-50"
                />
                <span className="self-center text-sm text-muted">%</span>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                {PERCENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStopLossPercent(preset)}
                    className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-loss"
                  >
                    −{preset}%
                  </button>
                ))}
              </div>
              {previewStopLossPrice !== null && (
                <p className="mt-1.5 text-[11px] text-muted">{formatKRW(previewStopLossPrice)}에 도달하면 매도</p>
              )}
            </div>

            <div>
              <label htmlFor="oco-take-profit" className="text-sm font-medium text-gain">
                익절 비율 (+%)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="oco-take-profit"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={!holding || available <= 0}
                  placeholder="20"
                  value={takeProfitPercent}
                  onChange={(e) => setTakeProfitPercent(cleanDecimal(e.target.value, 4))}
                  className="w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-gain focus:ring-4 focus:ring-gain/15 disabled:opacity-50"
                />
                <span className="self-center text-sm text-muted">%</span>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                {PERCENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTakeProfitPercent(preset)}
                    className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.1] hover:text-gain"
                  >
                    +{preset}%
                  </button>
                ))}
              </div>
              {previewTakeProfitPrice !== null && (
                <p className="mt-1.5 text-[11px] text-muted">{formatKRW(previewTakeProfitPrice)}에 도달하면 매도</p>
              )}
            </div>
              </>
            ) : (
              <>
            <div>
              <label htmlFor="oco-stop-loss-price" className="text-sm font-medium text-loss">
                손절가 (원)
              </label>
              <input
                id="oco-stop-loss-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={!holding || available <= 0}
                placeholder="0"
                value={formatPriceInput(stopLossPrice)}
                onChange={(e) => setStopLossPrice(cleanDecimal(e.target.value.replace(/,/g, ''), 4))}
                className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-loss focus:ring-4 focus:ring-loss/15 disabled:opacity-50"
              />
              {holding && stopLossPriceNumber > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">
                  평균매수가 대비 {(((stopLossPriceNumber - holding.averagePrice) / holding.averagePrice) * 100).toFixed(1)}%
                </p>
              )}
            </div>

            <div>
              <label htmlFor="oco-take-profit-price" className="text-sm font-medium text-gain">
                익절가 (원)
              </label>
              <input
                id="oco-take-profit-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={!holding || available <= 0}
                placeholder="0"
                value={formatPriceInput(takeProfitPrice)}
                onChange={(e) => setTakeProfitPrice(cleanDecimal(e.target.value.replace(/,/g, ''), 4))}
                className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-right text-[15px] text-ink tabular outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-gain focus:ring-4 focus:ring-gain/15 disabled:opacity-50"
              />
              {holding && takeProfitPriceNumber > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">
                  평균매수가 대비 +{(((takeProfitPriceNumber - holding.averagePrice) / holding.averagePrice) * 100).toFixed(1)}%
                </p>
              )}
            </div>
              </>
            )}

            {formError && <p className="text-sm text-loss">{formError}</p>}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!holding || available <= 0 || submitting || disableReason !== null}
              onClick={() => void handleSubmit()}
            >
              {submitting ? '예약 처리 중' : '예약 걸기'}
            </Button>
            {disableReason && !submitting && (
              <p className="text-[11px] leading-relaxed text-muted">{disableReason}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
