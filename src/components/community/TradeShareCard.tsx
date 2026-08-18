// 게시물에 첨부된 매매 데이터를 캔버스 이미지가 아니라 실제 UI(React/HTML)로 그리는 네이티브 수익 인증 카드
import { formatKRW, pnlTone } from '../../lib/format'
import { formatRatePercent } from '../../services/feedbackService'
import type { SharedTrade } from '../../services/types'

interface Props {
  trade: SharedTrade
  className?: string
}

/** 10.00000000 처럼 scale 이 붙어 오는 코인 수량을 불필요한 0 없이 표시한다. Portfolio.tsx 의 동명 헬퍼와 같은 규칙. */
function formatQty(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
}

/** 부호를 붙인 정확한 원화 금액. Portfolio.tsx 의 동명 헬퍼와 같은 규칙. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

export function TradeShareCard({ trade, className = '' }: Props) {
  const tone = pnlTone(trade.realizedPnl)

  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="inline-block rounded-full bg-loss/15 px-2 py-0.5 text-[11px] font-medium text-loss">
          매도
        </span>
        <span className="text-[11px] text-muted">{trade.market === 'CRYPTO' ? '코인' : '주식'}</span>
      </div>

      <div className="mt-3">
        <p className="font-display text-lg font-semibold text-ink">{trade.name}</p>
        <p className="text-xs text-muted">{trade.symbol}</p>
      </div>

      {/* 수익률 — 카드에서 가장 큰 숫자 */}
      <p className={`mt-4 text-4xl font-bold tabular ${tone}`}>{formatRatePercent(trade.returnRate)}</p>
      <p className={`mt-1 text-sm font-medium tabular ${tone}`}>{signedKRW(trade.realizedPnl)}</p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
        <div>
          <dt className="text-muted">매수가</dt>
          <dd className="mt-0.5 tabular text-ink">{formatKRW(trade.buyPrice)}</dd>
        </div>
        <div>
          <dt className="text-muted">매도가</dt>
          <dd className="mt-0.5 tabular text-ink">{formatKRW(trade.sellPrice)}</dd>
        </div>
        <div>
          <dt className="text-muted">수량</dt>
          <dd className="mt-0.5 tabular text-ink">{formatQty(trade.quantity)}</dd>
        </div>
      </dl>
    </div>
  )
}
