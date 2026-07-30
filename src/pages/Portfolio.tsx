// TODO(4차): Portfolio 실연동 재작성 예정 (보유 종목 + 거래내역 커서 페이징 + 계좌 요약)
// 포트폴리오 페이지 자리표시자 — holdingService·tradeService·accountService 기반 화면으로 교체된다
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'

export function Portfolio() {
  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-32">
      <div className="mx-auto max-w-2xl">
        <Card accent="brand" innerClassName="p-8 text-center">
          <div className="flex justify-center">
            <Eyebrow>포트폴리오</Eyebrow>
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">준비 중입니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            보유 종목과 체결 내역을 실제 계좌 데이터로 보여주는 화면으로 교체하는 중입니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
