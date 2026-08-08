// 마케팅 랜딩 페이지 — 실제로 동작하는 기능만 남긴 섹션을 순서대로 조립
import { Hero } from '../components/landing/Hero'
import { ReplayScrub } from '../components/landing/ReplayScrub'
import { MarketOrders } from '../components/landing/MarketOrders'
import { SplitAccounts } from '../components/landing/SplitAccounts'
import { MascotTutorial } from '../components/landing/MascotTutorial'
import { CommunityIntro } from '../components/landing/CommunityIntro'
import { TechHighlights } from '../components/landing/TechHighlights'
import { CTA } from '../components/landing/CTA'

export function Landing() {
  return (
    <>
      <Hero />
      {/* 스크롤을 장중 시간축으로 쓰는 구간 — 이 페이지에서 모션이 주도하는 유일한 섹션이다 */}
      <ReplayScrub />
      <SplitAccounts />
      <MarketOrders />
      <MascotTutorial />
      <CommunityIntro />
      <TechHighlights />
      <CTA />
    </>
  )
}
