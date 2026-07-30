// 마케팅 랜딩 페이지 — 실제로 동작하는 기능만 남긴 섹션을 순서대로 조립
import { Hero } from '../components/landing/Hero'
import { TechHighlights } from '../components/landing/TechHighlights'
import { CTA } from '../components/landing/CTA'

export function Landing() {
  return (
    <>
      <Hero />
      <TechHighlights />
      <CTA />
    </>
  )
}
