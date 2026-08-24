// 튜토리얼이 지금 어느 학습 국면에 있는지 판정하고 그 이름과 "지금 할 일" 한 줄을 돌려주는 단 하나의 자리
import type { Market } from '../../services/types'

/**
 * **번호를 붙이지 않는다.** 이 화면에는 예전에 번호 체계가 여섯 개 있었고(상단 로드맵 4단계·체크리스트
 * 3칩·백엔드가 부르는 5단계·대본 번호·주문 패널 인라인 헤딩·ExitJourneyGuide 자체 3칸) 서로 어긋난
 * 숫자가 같은 순간에 화면에 동시에 떴다. 더 근본적인 문제는 **여섯 체계가 전부 조작을 셌다는 것**이다 —
 * 손절을 겪는 그 순간에도 화면이 하는 말이 "지켜보기"였다.
 *
 * 그래서 국면에는 학습 목표로 이름만 붙이고, 진행감은 상단의 목표 칸들(`TutorialGoalRail`)이 전담한다.
 * `PLAN`↔`WATCH`가 손절·익절을 겪을 때마다 되풀이되므로 번호로는 애초에 정직하게 셀 수 없다 —
 * 이름이 `PLAN`으로 되돌아가는 것 자체가 "한 번 더 한다"는 신호다.
 */
export type TutorialPhase = 'SELECT' | 'ORDER_BASICS' | 'PLAN' | 'WATCH' | 'REVIEW'

export interface TutorialPhaseInput {
  /** 아직 종목을 고르지 않았는가(`attempt.status === 'SELECTING_INSTRUMENT'`). */
  selectingInstrument: boolean
  /**
   * 이 실행이 끝났는가. 완료 기록(replay)이거나, 대본이 끝난 뒤의 전량 매도다 — 기존 `reviewReady`의
   * 앞쪽 절반과 같은 판정이라 호출부에서 같은 값을 넘긴다.
   */
  finished: boolean
  /** 2단계 대본 구간인가(`scenarioStage === 'ORDER_BASICS'`). */
  orderBasics: boolean
  /**
   * 이 시장에 손절·익절 예약이라는 개념이 있는가. **주식은 false다** — 예약 경로가 코인 전용이라
   * 주식에서는 "팔 기준을 미리 정하기"라는 국면이 영영 오지 않는다.
   */
  supportsExitPlan: boolean
  holding: boolean
  hasPlan: boolean
  /** 상단의 목표 칸들을 다 채웠는가. */
  goalsComplete: boolean
}

/**
 * 판정 순서가 곧 우선순위다. **`finished`를 국면들보다 먼저 본다** — 끝난 실행에서 "지금 사세요"라고
 * 말하면 할 수 없는 일을 시키는 것이 된다.
 *
 * 이야기 구간에서 **보유가 없는데 목표가 아직 남았으면 `PLAN`으로 되돌아간다.** 손절로 정리된 직후가
 * 정확히 그 상태이고, 그때 사용자가 들어야 하는 말은 "다시 사서 기준을 정하라"이기 때문이다.
 */
export function tutorialPhase(input: TutorialPhaseInput): TutorialPhase {
  if (input.selectingInstrument) return 'SELECT'
  if (input.finished) return 'REVIEW'
  if (input.orderBasics) return 'ORDER_BASICS'
  if (!input.supportsExitPlan) return input.holding ? 'WATCH' : 'PLAN'
  if (input.holding) return (input.hasPlan ? 'WATCH' : 'PLAN')
  if (input.goalsComplete) return 'REVIEW'
  return 'PLAN'
}

/**
 * 국면의 이름과 그 아래 한 줄. **한 시점에 읽을 문장은 한 줄이다** — 처음 온 사람은 문단을 읽지 않는다.
 *
 * 주식은 예약이 없어 `PLAN`·`WATCH`가 각각 "사보기"·"팔아보기"라는 다른 뜻이 된다. 같은 국면 값에
 * 시장별로 다른 이름을 붙이는 이유는 판정 자체는 똑같기 때문이다(보유 여부 하나로 갈린다).
 */
export function phaseText(
  phase: TutorialPhase,
  options: { market: Market; holding: boolean },
): { title: string; todo: string } {
  const stock = options.market === 'STOCK'
  switch (phase) {
    case 'SELECT':
      return { title: '연습할 종목 고르기', todo: '왼쪽에서 하나 고르세요' }
    case 'ORDER_BASICS':
      return {
        title: '주문 넣는 법 익히기',
        todo: '시장가로 한 번 사고팔기 → 지정가로 한 번 사고팔기',
      }
    case 'PLAN':
      if (stock) return { title: '사보기', todo: '몇 개 살지 정하고 사 보세요' }
      // 국면 이름이 **왜 하필 지금인지**를 말한다 — 값이 움직인 뒤에는 같은 사람이 다른 숫자를 고른다.
      return {
        title: '흔들리기 전에 팔 기준 정하기',
        todo: options.holding
          ? '얼마나 내려가면 팔지, 올라가면 팔지 지금 정하세요'
          : '다시 사고, 얼마나 내려가면 팔지·올라가면 팔지 지금 정하세요',
      }
    case 'WATCH':
      if (stock) return { title: '팔아보기', todo: '값이 움직이는 걸 보다가 팔아 보세요' }
      return { title: '규칙이 대신 파는 것 지켜보기', todo: '선에 닿을 때까지 기다립니다' }
    case 'REVIEW':
      return { title: '되돌아보기', todo: '왜 그렇게 했는지 한 줄 적기' }
  }
}
