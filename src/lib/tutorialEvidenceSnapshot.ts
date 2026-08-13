// 완료된 튜토리얼의 단계별 시각(즐겨찾기·매수·복기 등록 시각)을 로컬에 고정해 두는 저장소.
//
// 백엔드는 완료된 chain의 evidence(매수·매도 체결 시각)를 매 요청마다 "이 종목의 가장 최근
// 체결"로 다시 계산한다(031 재도전 지원을 위한 설계) — 그래서 "다시 하기" 체험 중에 같은 종목을
// 실제로 다시 매수·매도하면, 원래 완료 시점이 그 실제 거래 시각으로 바뀌어 보일 수 있다. 완료
// 기록·보상은 바뀌지 않지만 화면에 보이는 "언제 완료했다"는 문구가 흔들리면 사용자가 혼란스럽다.
//
// 그래서 화면에는(진행 중·잠긴 단계가 아니라 완료된 단계에 한해) 이 스냅샷을 보여준다 — 처음
// 완료했을 때 한 번 찍고, "처음부터 다시하기"를 끝까지 마쳤을 때만 새로 찍는다. 중간에 그만두면
// 이전 스냅샷이 그대로 남는다.
import type { InvestmentPracticeResponse } from '../services/tutorialTypes'
import type { Market } from '../services/types'

const STORAGE_PREFIX = 'tutorial-evidence-snapshot:'

export function loadEvidenceSnapshot(market: Market): InvestmentPracticeResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + market)
    return raw ? (JSON.parse(raw) as InvestmentPracticeResponse) : null
  } catch {
    return null
  }
}

export function saveEvidenceSnapshot(market: Market, progress: InvestmentPracticeResponse): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + market, JSON.stringify(progress))
  } catch {
    // localStorage를 쓸 수 없어도 화면은 항상 최신 progress로 그냥 폴백한다 — 조용히 건너뛴다.
  }
}
