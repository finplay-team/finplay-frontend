// 튜토리얼 매도 화면의 "예약 매도" 탭 — 보유 중인 종목에 손절·익절 예약을 직접 걸고 취소하는 자리
import { Button } from '../ui/Button'
import { ExitRateFields, rateError } from './ExitRateFields'
import { formatKRW } from '../../lib/format'
import type { ExitRateBounds, PracticeExitPlanSummary } from '../../services/tutorialTypes'

interface Props {
  bounds: ExitRateBounds
  /** 지금 걸려 있는 예약. 있으면 폼 대신 예약 카드를 그린다(실전 패널과 같은 전환이다). */
  plan: PracticeExitPlanSummary | null
  /** 기준가 = 평균 매수가. 서버가 예약선을 이 값에서 만든다. */
  entryPrice: number | null
  holdingQuantity: number | null
  stopLossInput: string
  takeProfitInput: string
  onStopLossInputChange: (next: string) => void
  onTakeProfitInputChange: (next: string) => void
  suggestedStopLossRate: number
  suggestedTakeProfitRate: number
  /** 2단계(주문 방법 학습)라 아직 다룰 자리가 아닌가. */
  stageLocked: boolean
  /**
   * 지금 새 예약을 걸 수 있는가(서버 판정). 보유 중이고 예약이 없어도 `false`일 수 있다 — 예약은
   * 한 진입에 한 번뿐이라, 걸었다 취소한 진입이 그 상태다(409 `EXIT_PLAN_ALREADY_EXISTS`).
   */
  canReserve: boolean
  submitting: boolean
  cancelling: boolean
  /** 이번 보유에서 예약을 한 번 걸었다가 취소했는가. 취소가 조용히 끝나지 않게 하려는 표시다. */
  cancelledOnce: boolean
  onSubmit: (stopLossRate: number, takeProfitRate: number) => void
  onCancel: (exitPlanId: number) => void
}

/**
 * **실전 `OcoExitPlanPanel`을 재사용하지 않고 같은 모양으로 감싼다.** 실전 패널은 실계좌 `holding`과
 * `/api/exit-plans` 목록을 직접 읽는데, 튜토리얼 종목은 샌드박스라 그 목록에 잡히지 않고(spec 033)
 * 생성 경로도 전용 엔드포인트다. 실전 패널에 튜토리얼 분기를 심으면 실전 화면이 지저분해지므로,
 * **입력 경험만 같게 하고 데이터 경로는 갈라놓는 쪽**을 골랐다 — 라벨·설명 문구·예약 카드 모양·
 * 버튼 문구를 실전과 맞춰 두어, 여기서 익힌 조작이 실전에서 그대로 통한다.
 *
 * 수량 입력이 없는 것만 실전과 다르다. 서버가 보유 전량에 거는 계약이라 넣을 칸이 없고, 대신 그
 * 사실과 "실전에서는 나눠 걸 수도 있다"를 한 줄로 말해 준다.
 */
export function TutorialExitPlanPanel({
  bounds,
  plan,
  entryPrice,
  holdingQuantity,
  stopLossInput,
  takeProfitInput,
  onStopLossInputChange,
  onTakeProfitInputChange,
  suggestedStopLossRate,
  suggestedTakeProfitRate,
  stageLocked,
  canReserve,
  submitting,
  cancelling,
  cancelledOnce,
  onSubmit,
  onCancel,
}: Props) {
  const holding = holdingQuantity !== null && holdingQuantity > 0

  if (stageLocked) {
    return (
      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-medium text-ink">예약 매도</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          이 단계는 주문 방법을 배우는 자리라 예약 매도는 다음 단계에서 직접 걸어 봅니다. 지금은
          시장가·지정가로 사고파는 것만 연습합니다.
        </p>
      </div>
    )
  }

  if (plan !== null) {
    return (
      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-medium text-ink">걸어 둔 예약</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          손절가·익절가 중 먼저 닿는 쪽으로 자동 매도되고, 나머지 하나는 자동 취소돼요.
        </p>
        <div className="mt-3 rounded-xl bg-elevated p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1 text-xs tabular">
              <span className="text-loss">
                손절 -{plan.stopLossRate}% · {formatKRW(plan.stopLossPrice)}
              </span>
              <span className="text-gain">
                익절 +{plan.takeProfitRate}% · {formatKRW(plan.takeProfitPrice)}
              </span>
            </div>
            {/*
              예약 번호를 아직 모르면(서버가 진행 조회에 안 실어 주는 배포 전 상태) 취소 버튼을
              그리지 않는다 — 없는 번호로 DELETE를 부르면 무슨 일이 일어나는지 화면이 설명할 수 없다.
            */}
            {plan.exitPlanId !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={cancelling}
                onClick={() => onCancel(plan.exitPlanId as number)}
              >
                {cancelling ? '취소 중…' : '예약 취소'}
              </Button>
            )}
          </div>
          {/* 기준가는 서버가 그 예약에 실어 준 값이 정본이다 — 화면이 진입 기록에서 고른 값보다 앞선다. */}
          {(plan.entryPrice ?? entryPrice) !== null && (
            <p className="mt-2 text-[11px] text-muted tabular">
              가진 수량 전부 · 기준가(평균 매수가) {formatKRW((plan.entryPrice ?? entryPrice) as number)}
            </p>
          )}
        </div>
      </div>
    )
  }

  /**
   * 보유 중인데 걸 수 없는 상태 — 이 진입에서 이미 한 번 걸었다(취소했어도 그 한 번으로 친다).
   * 입력 칸을 그려 두고 눌리지 않게만 하면 "왜 안 되지"로 막히므로, 폼 자체를 이유로 바꾼다.
   */
  if (holding && !canReserve) {
    return (
      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-medium text-ink">예약 매도</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {cancelledOnce
            ? '방금 예약을 취소했습니다. 예약은 한 번 산 것에 한 번만 걸 수 있어서, 이 진입에는 다시 걸 수 없어요.'
            : '이 진입에는 이미 예약을 걸었던 적이 있어 다시 걸 수 없습니다.'}{' '}
          지금 가진 것을 직접 팔고 다시 사면 새로 걸 수 있습니다.
        </p>
      </div>
    )
  }

  const stopLossErrorText = rateError(stopLossInput, bounds.stopLossMin, bounds.stopLossMax, '손절')
  const takeProfitErrorText = rateError(
    takeProfitInput,
    bounds.takeProfitMin,
    bounds.takeProfitMax,
    '익절',
  )
  /**
   * 버튼 아래 한 줄은 **입력창이 이미 말한 것을 되풀이하지 않는다.** 비율이 틀렸을 때 같은 문장을 두
   * 번 그리면 사용자는 두 개의 다른 문제로 읽는다 — 그 경우는 "위에 적힌 이유를 고치면 된다"로만 말한다.
   */
  const disableReason: string | null = !holding
    ? '지금 가진 것이 없어 예약할 수 없습니다. 먼저 사고 나서 걸어 주세요.'
    : stopLossErrorText !== null || takeProfitErrorText !== null
      ? '두 비율을 범위 안에서 정해야 예약을 걸 수 있습니다.'
      : null

  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-sm font-medium text-ink">예약 매도</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        손절 비율·익절 비율 중 먼저 닿는 쪽으로 자동 매도되고, 나머지 하나는 자동 취소돼요. 여기서
        거는 예약이 바로 손절과 익절을 겪는 자리입니다.
      </p>
      {cancelledOnce && (
        <p className="mt-2 text-xs leading-relaxed text-loss">
          예약을 취소했습니다. 다시 걸지 않으면 값이 아무리 떨어지거나 올라도 저절로 정리되지 않아요.
        </p>
      )}
      <div className="mt-3">
        <ExitRateFields
          bounds={bounds}
          stopLossInput={stopLossInput}
          takeProfitInput={takeProfitInput}
          onStopLossInputChange={onStopLossInputChange}
          onTakeProfitInputChange={onTakeProfitInputChange}
          suggestedStopLossRate={suggestedStopLossRate}
          suggestedTakeProfitRate={suggestedTakeProfitRate}
          disabled={!holding || submitting}
          basePrice={entryPrice}
          quantity={holdingQuantity ?? 0}
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        가진 수량 전부에 걸립니다. 실전에서는 수량을 나눠 일부만 예약할 수도 있어요.
      </p>
      <Button
        type="button"
        size="lg"
        className="mt-3 w-full"
        disabled={submitting || disableReason !== null}
        onClick={() => onSubmit(Number(stopLossInput), Number(takeProfitInput))}
      >
        {submitting ? '예약 처리 중…' : '예약 걸기'}
      </Button>
      {disableReason !== null && !submitting && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{disableReason}</p>
      )}
    </div>
  )
}
