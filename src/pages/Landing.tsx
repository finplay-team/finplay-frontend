// 마케팅 랜딩 페이지 — 8개 섹션을 순서대로 조립
import { Hero } from '../components/landing/Hero'
import { RecordReview } from '../components/landing/RecordReview'
import { AiHabit } from '../components/landing/AiHabit'
import { SplitAccounts } from '../components/landing/SplitAccounts'
import { RankingPhilosophy } from '../components/landing/RankingPhilosophy'
import { Missions } from '../components/landing/Missions'
import { TechHighlights } from '../components/landing/TechHighlights'
import { CTA } from '../components/landing/CTA'

export function Landing() {
  return (
    <>
      <Hero />
      <RecordReview />
      <AiHabit />
      <SplitAccounts />
      <RankingPhilosophy />
      <Missions />
      <TechHighlights />
      <CTA />
    </>
  )
}
