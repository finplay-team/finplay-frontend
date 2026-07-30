// TODO(4차): Trade 실연동 재작성 예정 (SSE 시세 + 시장가 주문 + Idempotency-Key)
// 거래 페이지 자리표시자 — useStockStream·useCandles·orderService 기반 화면으로 교체된다
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'

export function Trade() {
  return (
    <div className="min-h-[100dvh] px-4 pb-24 pt-32">
      <div className="mx-auto max-w-2xl">
        <Card accent="brand" innerClassName="p-8 text-center">
          <div className="flex justify-center">
            <Eyebrow>거래</Eyebrow>
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-ink">준비 중입니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            실시간 주식 시세와 시장가 주문 화면으로 교체하는 중입니다.
          </p>
        </Card>
      </div>
    </div>
  )
}
