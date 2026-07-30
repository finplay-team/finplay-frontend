// 오프셋 없는 백엔드 LocalDateTime 문자열을 브라우저 로컬 시각으로 해석·표시하는 유틸
import type { Decimal, LocalDateTimeString } from '../services/types'

/**
 * "2026-07-29T09:01:00" 을 브라우저 로컬(KST) 시각으로 해석한다.
 * 'Z' 를 붙이면 UTC 로 읽혀 9시간 어긋나므로 절대 붙이지 않는다.
 */
export function parseLocalDateTime(value: LocalDateTimeString): Date {
  const [datePart, timePart = '00:00:00'] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, Math.floor(second || 0))
}

/** 차트 축·목록용 "09:01" */
export function formatHhMm(value: LocalDateTimeString): string {
  const d = parseLocalDateTime(value)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "7월 29일 09:01" */
export function formatDateTime(value: LocalDateTimeString): string {
  const d = parseLocalDateTime(value)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatHhMm(value)}`
}

/**
 * 백엔드 returnRate 는 퍼센트가 아니라 scale-4 비율이다 (0.0020 == 0.20%).
 * ×100 은 이 함수 한 곳에서만 한다. formatPercent 는 계속 퍼센트를 받는다.
 */
export function ratioToPercent(ratio: Decimal): number {
  return ratio * 100
}
