// 게시물 링크·카드 이미지 공유(navigator.share/클립보드/다운로드 폴백)와 카드 텍스트·렌더링을 담당하는 유틸
import type { Post } from '../services/types'

/** 게시물 상세 페이지 URL. 라우팅은 App.tsx 의 `/community/:postId` 패턴을 그대로 따른다. */
export function buildPostShareUrl(postId: number): string {
  return `${window.location.origin}/community/${postId}`
}

const TITLE_LIMIT = 40
const CONTENT_LIMIT = 90

/** 카드에 넣기엔 너무 긴 텍스트를 자르고 말줄임표를 붙인다. 공백만 남는 경우를 대비해 trim 한다. */
export function truncateForCard(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trimEnd()}…`
}

export interface ShareCardText {
  title: string
  content: string
  author: string
}

/** 카드에 그릴 텍스트만 순수하게 뽑아낸다 — 캔버스 없이도 잘림 규칙을 테스트할 수 있다. */
export function buildShareCardText(post: Post): ShareCardText {
  return {
    title: truncateForCard(post.title, TITLE_LIMIT),
    content: truncateForCard(post.content, CONTENT_LIMIT),
    author: post.authorNickname,
  }
}

export const SHARE_CARD_WIDTH = 720
export const SHARE_CARD_HEIGHT = 720
const CARD_MARGIN = 40
const CARD_PADDING = 48
const CARD_RADIUS = 28
const CONTENT_MAX_LINES = 5

// tailwind.config.js 의 다크 톤 토큰과 값을 맞춘다.
const COLOR_BG = '#0A0A0B'
const COLOR_SURFACE = '#131317'
const COLOR_LINE = '#26262E'
const COLOR_INK = '#F4F4F6'
const COLOR_MUTED = '#9A9AA6'
const COLOR_BRAND = '#5EEAD4'

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 글자 단위로 폭에 맞춰 줄바꿈한다(한글은 띄어쓰기 기준 wrap 이 부자연스러워 문자 단위로 자른다). */
function wrapByChar(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const candidate = line + ch
    if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
      lines.push(line)
      line = ch
      if (lines.length === maxLines - 1) {
        // 마지막 줄에 남은 전부를 몰아 넣고 필요하면 말줄임표를 붙인다.
        const rest = text.slice(text.indexOf(line))
        const fitted = truncateToWidth(ctx, rest, maxWidth)
        lines.push(fitted)
        return lines
      }
    } else {
      line = candidate
    }
  }
  if (line.length > 0) lines.push(line)
  return lines
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1
  }
  return `${text.slice(0, end)}…`
}

/**
 * 게시물 제목·내용 일부·작성자를 담은 다크 톤 공유 카드를 canvas 2D API 로 직접 그린다.
 * 캔버스 2D 컨텍스트를 지원하지 않는 극히 드문 환경이면 false 를 돌려주고 아무것도 그리지 않는다.
 */
export function drawShareCard(canvas: HTMLCanvasElement, post: Post): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const { title, content, author } = buildShareCardText(post)

  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)

  const cardX = CARD_MARGIN
  const cardY = CARD_MARGIN
  const cardW = SHARE_CARD_WIDTH - CARD_MARGIN * 2
  const cardH = SHARE_CARD_HEIGHT - CARD_MARGIN * 2
  roundRectPath(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fillStyle = COLOR_SURFACE
  ctx.fill()
  ctx.strokeStyle = COLOR_LINE
  ctx.lineWidth = 1
  ctx.stroke()

  const textX = cardX + CARD_PADDING
  const textMaxWidth = cardW - CARD_PADDING * 2
  let cursorY = cardY + CARD_PADDING + 44

  // 브랜드 마크
  ctx.fillStyle = COLOR_BRAND
  ctx.font = '600 20px Pretendard, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('FinPlay 커뮤니티', textX, cursorY)
  cursorY += 56

  // 제목 (최대 2줄)
  ctx.fillStyle = COLOR_INK
  ctx.font = '700 34px Pretendard, sans-serif'
  const titleLines = wrapByChar(ctx, title, textMaxWidth, 2)
  for (const line of titleLines) {
    ctx.fillText(line, textX, cursorY)
    cursorY += 46
  }
  cursorY += 20

  // 본문 일부 (최대 5줄)
  ctx.fillStyle = COLOR_MUTED
  ctx.font = '400 24px Pretendard, sans-serif'
  const contentLines = wrapByChar(ctx, content, textMaxWidth, CONTENT_MAX_LINES)
  for (const line of contentLines) {
    ctx.fillText(line, textX, cursorY)
    cursorY += 36
  }

  // 작성자 — 카드 하단에 고정
  ctx.fillStyle = COLOR_INK
  ctx.font = '500 20px Pretendard, sans-serif'
  ctx.fillText(author, textX, cardY + cardH - CARD_PADDING)

  return true
}

export type ShareLinkResult = 'shared' | 'copied' | 'failed'

/**
 * 링크 공유. navigator.share 가 있으면 제목+URL 로 시스템 공유 시트를 띄우고,
 * 없으면(또는 사용자가 취소해 AbortError 가 나면) 클립보드 복사로 폴백한다.
 * 사용자가 공유 시트를 취소한 경우는 실패가 아니라 "복사도 하지 않고 끝"이라 별도로 구분한다.
 */
export async function sharePostLink(post: Post): Promise<ShareLinkResult> {
  const url = buildPostShareUrl(post.postId)
  if (navigator.share) {
    try {
      await navigator.share({ title: post.title, url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed'
      // 공유 시트 자체를 지원하지 않아 던지는 경우 등은 복사로 폴백한다.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export type ShareImageResult = 'shared' | 'downloaded' | 'failed'

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * 카드를 그려 이미지로 공유한다. 파일 공유가 가능하면(navigator.canShare) 시스템 공유 시트로,
 * 아니면 다운로드 링크 클릭으로 폴백한다. 캔버스를 지원하지 않거나 blob 생성에 실패하면 'failed'.
 */
export async function sharePostImage(post: Post): Promise<ShareImageResult> {
  const canvas = document.createElement('canvas')
  if (!drawShareCard(canvas, post)) return 'failed'

  const blob = await canvasToBlob(canvas)
  if (!blob) return 'failed'

  const file = new File([blob], `finplay-post-${post.postId}.png`, { type: 'image/png' })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: post.title })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed'
      // 공유 실패 시 다운로드로 폴백한다.
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `finplay-post-${post.postId}.png`
    link.click()
    return 'downloaded'
  } finally {
    URL.revokeObjectURL(url)
  }
}
