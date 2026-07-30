// 통화·손익·퍼센트 등 숫자 표기를 한국어 형식으로 통일하는 포맷 유틸

/** 원화 표기. 예: 10000000 -> "1,000만원" 대신 정확 금액이 필요하면 formatKRW 사용 */
export function formatKRW(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`
}

/** 큰 금액을 만/억 단위로 축약. 예: 12400000 -> "1,240만" */
export function formatManEok(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000
    return `${sign}${eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`
  }
  if (abs >= 10_000) {
    const man = Math.round(abs / 10_000)
    return `${sign}${man.toLocaleString('ko-KR')}만`
  }
  return `${sign}${abs.toLocaleString('ko-KR')}`
}

/** 손익 표기 — 부호와 함께 만원 단위 축약 */
export function formatPnl(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatManEok(Math.abs(value))}`
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

/** 손익 부호에 따른 색상 유틸 클래스 (다크 배경용 gain/loss 토큰) */
export function pnlTone(value: number): string {
  if (value > 0) return 'text-gain'
  if (value < 0) return 'text-loss'
  return 'text-muted'
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
