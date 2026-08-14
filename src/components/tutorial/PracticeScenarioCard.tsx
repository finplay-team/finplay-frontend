// 튜토리얼 종목 선택 화면에서 "왜 이 종목이 움직이는지·왜 골라볼 만한지" 감을 주는 연습용 가상 뉴스 카드 —
// 실제 뉴스 연동이 아니다
import { useMemo } from 'react'
import { Card } from '../ui/Card'
import type { Market } from '../../services/types'

/**
 * 실제 뉴스 API 연동이 아니라 하드코딩한 짧은 가상 상황이다 — 실제 시세와 무관하며, 초등학생도
 * "가격은 이런 이유로 움직이는구나"를 감으로 익히도록 돕는 예시일 뿐이다. 오해를 막기 위해 카드에
 * "실제 뉴스가 아니에요" 배지를 항상 함께 보여준다. {name}은 추천 종목 이름으로 치환한다.
 */
const SCENARIOS: Record<Market, string> = {
  CRYPTO: '최근 며칠 사이 {name}을 쓰는 사람이 눈에 띄게 늘었어요. 커뮤니티에서도 앞으로 어떻게 움직일지 궁금하다는 이야기가 많아요.',
  STOCK: '{name}이 새로운 제품 소식을 발표해서 요즘 관심이 많아요. 사람들이 이 회사를 주목하고 있어요.',
}

export function PracticeScenarioCard({
  market,
  recommendedName,
}: {
  market: Market
  /** 추천할 종목 이름 — 목록을 아직 못 불러왔으면 null(그 경우 추천 문구는 생략한다). */
  recommendedName: string | null
}) {
  const scenario = useMemo(
    () => (recommendedName ? SCENARIOS[market].replace('{name}', recommendedName) : null),
    [market, recommendedName],
  )

  return (
    <Card accent="none" innerClassName="p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-muted">
          연습용 가상 뉴스
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        {scenario ?? '종목을 불러오는 중입니다.'}
      </p>
      {recommendedName && (
        <p className="mt-1 text-sm font-medium text-ink">
          그래서 이번 연습은 <span className="text-brand">{recommendedName}</span>으로 해보는 걸 추천해요.
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted">
        실제 뉴스가 아니에요 — 가격이 왜 움직이는지 감을 잡아보는 연습용 이야기예요.
      </p>
    </Card>
  )
}
