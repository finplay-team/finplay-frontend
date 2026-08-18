// 수익 인증 카드를 <canvas> 2D API로 직접 그리는 순수 렌더 함수 (외부 이미지 캡처 라이브러리 없음)
import { formatKRW } from './format'
import { formatRatePercent } from '../services/feedbackService'
import type { ShareCardData } from './shareCard'

export const SHARE_CARD_WIDTH = 720
export const SHARE_CARD_HEIGHT = 960

// tailwind.config.js 의 color 토큰과 값을 맞춘다 — canvas 는 Tailwind 클래스를 쓸 수 없어 직접 hex 를 든다.
const COLOR_CANVAS_BG = '#0A0A0B'
const COLOR_SURFACE = '#131317'
const COLOR_INK = '#F4F4F6'
const COLOR_MUTED = '#9A9AA6'
const COLOR_LINE = '#26262E'
const COLOR_BRAND = '#5EEAD4'
const COLOR_GAIN = '#FB7185'
const COLOR_LOSS = '#60A5FA'

const FONT_FAMILY = '"Pretendard Variable", "Pretendard", sans-serif'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 부호를 붙인 정확한 원화 금액. Portfolio.tsx 의 동명 헬퍼와 같은 규칙이지만, 캔버스 모듈을
 * React 컴포넌트에 의존시키지 않으려 여기 별도로 둔다. */
function signedKRW(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatKRW(Math.abs(value))}`
}

function statRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  valueColor: string,
): void {
  ctx.textAlign = 'left'
  ctx.fillStyle = COLOR_MUTED
  ctx.font = `500 22px ${FONT_FAMILY}`
  ctx.fillText(label, x, y)

  ctx.textAlign = 'right'
  ctx.fillStyle = valueColor
  ctx.font = `600 26px ${FONT_FAMILY}`
  ctx.fillText(value, x + width, y)
}

/** data 를 720x960 카드로 그린다. canvas 크기는 이 함수가 매번 다시 맞춘다(재사용 캔버스 대비). */
export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const toneColor = data.isGain ? COLOR_GAIN : COLOR_LOSS
  const margin = 48
  const panelX = margin
  const panelY = margin
  const panelW = SHARE_CARD_WIDTH - margin * 2
  const panelH = SHARE_CARD_HEIGHT - margin * 2

  // 배경
  ctx.fillStyle = COLOR_CANVAS_BG
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)

  // 카드 패널
  roundRect(ctx, panelX, panelY, panelW, panelH, 36)
  ctx.fillStyle = COLOR_SURFACE
  ctx.fill()

  const contentX = panelX + 48
  const contentW = panelW - 96

  // 배지
  ctx.textAlign = 'left'
  ctx.fillStyle = COLOR_BRAND
  ctx.font = `700 20px ${FONT_FAMILY}`
  ctx.fillText('FINPLAY · 수익 인증', contentX, panelY + 76)

  // 종목명 · 심볼
  ctx.fillStyle = COLOR_INK
  ctx.font = `700 40px ${FONT_FAMILY}`
  ctx.fillText(data.name, contentX, panelY + 148)
  ctx.fillStyle = COLOR_MUTED
  ctx.font = `500 22px ${FONT_FAMILY}`
  ctx.fillText(data.symbol, contentX, panelY + 184)

  // 수익률 — 카드에서 가장 큰 숫자
  ctx.fillStyle = toneColor
  ctx.font = `700 104px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.fillText(formatRatePercent(data.returnRate), SHARE_CARD_WIDTH / 2, panelY + 340)

  // 손익 금액
  ctx.font = `600 32px ${FONT_FAMILY}`
  ctx.fillText(signedKRW(data.pnlAmount), SHARE_CARD_WIDTH / 2, panelY + 392)

  // 구분선
  ctx.strokeStyle = COLOR_LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(contentX, panelY + 448)
  ctx.lineTo(contentX + contentW, panelY + 448)
  ctx.stroke()

  // 매수가 · 매도가
  statRow(ctx, '매수가', formatKRW(data.buyPrice), contentX, panelY + 512, contentW, COLOR_INK)
  statRow(ctx, '매도가', formatKRW(data.sellPrice), contentX, panelY + 560, contentW, COLOR_INK)

  // 하단 안내 문구
  ctx.textAlign = 'left'
  ctx.fillStyle = COLOR_MUTED
  ctx.font = `400 18px ${FONT_FAMILY}`
  ctx.fillText('FinPlay 모의투자로 연습한 매매 기록입니다.', contentX, panelY + panelH - 40)
}
