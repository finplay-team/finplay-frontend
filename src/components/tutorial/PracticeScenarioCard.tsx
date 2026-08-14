// 튜토리얼 진입 시 "가격이 왜 움직이는지" 감을 주는 연습용 가상 시나리오 카드 — 실제 뉴스 연동이 아니다
import { useMemo } from 'react'
import { Card } from '../ui/Card'
import type { Market } from '../../services/types'

/**
 * 실제 뉴스 API 연동이 아니라 하드코딩한 짧은 가상 상황이다 — 실제 시세와 무관하며, 초등학생도
 * "가격은 이런 이유로 움직이는구나"를 감으로 익히도록 돕는 예시일 뿐이다. 오해를 막기 위해 카드에
 * "실제 뉴스가 아니에요" 배지를 항상 함께 보여준다.
 */
const SCENARIOS: Record<Market, string[]> = {
  CRYPTO: [
    '이 코인을 쓰는 사람이 갑자기 많아져서 사려는 사람이 늘고, 값이 오르고 있어요.',
    '큰 투자자가 한꺼번에 많이 팔아서, 값이 잠깐 뚝 떨어졌어요.',
    '이 코인을 만든 회사가 새로운 소식을 발표해서, 사람들이 관심을 갖고 사고 있어요.',
    '전 세계 코인 시장이 전체적으로 흔들려서, 이 코인도 같이 오르내리고 있어요.',
  ],
  STOCK: [
    '이 회사가 새로운 제품을 내놓았다는 소식에 사람들이 관심을 갖고 주식을 사고 있어요.',
    '이 회사의 이번 분기 실적이 예상보다 안 좋아서, 주가가 조금 내려갔어요.',
    '이 회사와 관련된 산업 전체가 인기를 얻으면서, 같이 값이 오르고 있어요.',
    '시장 전체가 조심스러운 분위기라서, 이 회사 주가도 크게 움직이지 않고 있어요.',
  ],
}

export function PracticeScenarioCard({ market }: { market: Market }) {
  // 매번 다른 문장을 보여줄 필요는 없다 — market이 바뀔 때만 그 시장의 첫 시나리오를 고정해서 보여준다
  // (Math.random 은 렌더마다 값이 달라져 매 렌더 다른 문장이 깜빡이므로 쓰지 않는다).
  const scenario = useMemo(() => SCENARIOS[market][0], [market])

  return (
    <Card accent="none" innerClassName="p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-muted">
          연습용 가상 상황
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{scenario}</p>
      <p className="mt-1 text-[11px] text-muted">
        실제 뉴스가 아니에요 — 가격이 왜 움직이는지 감을 잡아보는 연습용 이야기예요.
      </p>
    </Card>
  )
}
