// 예약을 처음 거는 순간 한 번만 뜨는 규칙 설명 — 상시 카드로 깔려 있던 다섯 문단을 여기로 옮겼다
import { Button } from '../ui/Button'
import { TutorialModal } from './TutorialModal'

/**
 * 예전 `RiskEducationCard`는 차트 아래 **상시 큰 카드**로 다섯 문단(약 400자, 승률 계산 포함)과
 * 가격 dl 3칸을 깔고 있었다. 처음 온 사람은 그 문단을 읽지 않고, 그 자리를 계속 차지하는 바람에
 * 정작 지금 판단해야 할 "내가 건 예약" 카드가 스크롤 밖으로 밀렸다.
 *
 * 그래서 **예약을 거는 그 순간 한 번**만 말한다 — 설명이 필요한 시점은 정확히 그때 하나뿐이다.
 * 가격 숫자는 여기 없다. 손절·익절선 가격의 정본은 차트 점선과 차트 요약 한 줄 둘뿐이다.
 */
export function ExitRuleIntroModal({
  stopLossRate,
  takeProfitRate,
  onClose,
}: {
  stopLossRate: number
  takeProfitRate: number
  onClose: () => void
}) {
  /**
   * "열 번 중 몇 번만 맞아도 전체로는 손해를 보지 않는다"의 손익분기 승률. 사용자가 직접 정한 비율로
   * 계산하므로 손절을 익절보다 넓게 잡은 조합에서도 문구가 어긋나지 않는다.
   */
  const breakevenOutOfTen = Math.round((stopLossRate / (stopLossRate + takeProfitRate)) * 10)

  return (
    <TutorialModal
      eyebrow="손절·익절 예약"
      title="이 선에 닿으면 규칙이 대신 팝니다"
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
      {/*
        **왜 지금 정하는가**가 이 한 줄의 일이다. 값이 움직이기 시작한 뒤에는 같은 사람이 같은 숫자를
        다르게 고른다 — 아직 아무 일도 일어나지 않은 지금이 판단을 미리 끝내 둘 수 있는 유일한 때다.
      */}
      <p className="text-sm leading-relaxed text-ink">
        값이 움직이는 동안 판단하지 않으려고, 아무 일도 없는 지금 미리 정해 두는 두 선이에요.
      </p>

      <details className="mt-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
        <summary className="cursor-pointer text-sm text-ink">이 숫자는 왜 이렇게 정하나요?</summary>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted">
          {/*
            폭의 뜻은 **사용자가 고른 조합**에 따라 달라진다. 옛 프리셋 셋은 전부 손절이 익절보다
            좁아서 "손실 쪽을 좁게 잡았습니다"를 무조건 적을 수 있었지만, 자유 입력에서는 손절 5·익절 3
            같은 조합도 그대로 저장되므로 그 문장이 거짓이 될 수 있다.
          */}
          <p>
            {stopLossRate < takeProfitRate
              ? '손실 쪽을 이익 쪽보다 좁게 잡으셨습니다. 잃을 때는 작게 잃고 벌 때는 크게 번다는 뜻입니다.'
              : stopLossRate > takeProfitRate
                ? '이익 쪽을 손실 쪽보다 좁게 잡으셨습니다. 자주 이익을 챙기는 대신, 한 번 손절할 때 그만큼 크게 잃는다는 뜻입니다.'
                : '두 폭을 같게 잡으셨습니다. 잃을 때와 벌 때의 크기가 같다는 뜻입니다.'}
          </p>
          <p>
            이 조합이면 열 번 중 {breakevenOutOfTen}번만 맞아도 전체로는 손해를 보지 않습니다. 숫자 자체가
            정답인 건 아니지만 이 원칙은 어디서나 통합니다.
          </p>
          <p>예약을 건 시점의 산 값으로 정해진 뒤에는 가격이 움직여도 바뀌지 않습니다.</p>
        </div>
      </details>

      <Button type="button" className="mt-5 w-full" onClick={onClose}>
        알겠어요
      </Button>
    </TutorialModal>
  )
}
