// 마케팅 랜딩 페이지 — 실제로 동작하는 기능만 남긴 섹션을 순서대로 조립
import { Hero } from '../components/landing/Hero'
import { ReplayStream } from '../components/landing/ReplayStream'
import { MarketOrders } from '../components/landing/MarketOrders'
import { CommunityIntro } from '../components/landing/CommunityIntro'
import { TechHighlights } from '../components/landing/TechHighlights'
import { CTA } from '../components/landing/CTA'

export function Landing() {
  return (
    <>
      <Hero />
      <ReplayStream />
      <MarketOrders />
      <CommunityIntro />
      <TechHighlights />
      <CTA />
    </>
  )
}
