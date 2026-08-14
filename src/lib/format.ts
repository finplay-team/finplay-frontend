// 통화·손익·퍼센트 등 숫자 표기를 한국어 형식으로 통일하는 포맷 유틸

/**
 * 정확한 원화 금액. 예: 10000000 -> "10,000,000원". 축약이 필요하면 formatManEok 을 쓴다.
 * 원화는 소수 단위가 없다 — 코인 수량 × 가격처럼 소수가 섞인 계산값도 반올림해 정수로 보여준다.
 */
export function formatKRW(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
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

/**
 * 이미 퍼센트인 값을 받는다. 백엔드 scale-4 비율을 그대로 넘기면 안 된다 —
 * 변환은 datetime.ts 의 ratioToPercent 한 곳에서만 한다.
 */
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
