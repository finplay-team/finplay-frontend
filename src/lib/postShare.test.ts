// 게시물 공유 유틸(링크 공유·클립보드 복사 폴백·카드 텍스트 잘림·이미지 공유/다운로드 폴백)을 검증하는 테스트
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../services/types'
import {
  buildPostShareUrl,
  buildShareCardText,
  drawShareCard,
  sharePostImage,
  sharePostLink,
  truncateForCard,
} from './postShare'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    postId: 42,
    authorNickname: '투자왕',
    title: '오늘 삼성전자 매수 후기',
    content: '아침에 매수했는데 결과가 좋았습니다. 다음에도 같은 전략을 써볼까 합니다.',
    instrumentId: null,
    instrumentSymbol: null,
    instrumentName: null,
    imageId: null,
    imageUrl: null,
    likeCount: 0,
    likedByMe: false,
    createdAt: '2026-08-18T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    ...overrides,
  }
}

/** 캔버스 2D 컨텍스트를 흉내내는 최소 mock. measureText 는 문자당 10px 로 고정해 계산을 결정적으로 만든다. */
function fakeCtx() {
  return {
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
  }
}

describe('truncateForCard', () => {
  it('길이가 제한 이하면 그대로 둔다', () => {
    expect(truncateForCard('짧은 제목', 40)).toBe('짧은 제목')
  })

  it('길이가 제한을 넘으면 자르고 말줄임표를 붙인다', () => {
    const long = 'a'.repeat(50)
    expect(truncateForCard(long, 40)).toBe(`${'a'.repeat(40)}…`)
  })

  it('앞뒤 공백을 정리한 뒤 길이를 잰다', () => {
    expect(truncateForCard('   짧음   ', 40)).toBe('짧음')
  })
})

describe('buildShareCardText', () => {
  it('제목·내용이 길면 각각의 제한대로 잘라 낸다', () => {
    const post = makePost({ title: 'a'.repeat(60), content: 'b'.repeat(150) })
    const { title, content, author } = buildShareCardText(post)

    expect(title).toBe(`${'a'.repeat(40)}…`)
    expect(content).toBe(`${'b'.repeat(90)}…`)
    expect(author).toBe('투자왕')
  })

  it('제목·내용이 짧으면 잘리지 않는다', () => {
    const post = makePost()
    const { title, content } = buildShareCardText(post)

    expect(title).toBe(post.title)
    expect(content).toBe(post.content)
  })
})

describe('buildPostShareUrl', () => {
  it('현재 origin과 게시물 상세 라우트를 합친다', () => {
    expect(buildPostShareUrl(42)).toBe(`${window.location.origin}/community/42`)
  })
})

describe('drawShareCard', () => {
  it('2D 컨텍스트를 지원하지 않으면 false 를 돌려주고 아무것도 그리지 않는다', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(null)

    expect(drawShareCard(canvas, makePost())).toBe(false)
  })

  it('제목·본문 일부·작성자를 캔버스에 그린다', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)

    const post = makePost()
    expect(drawShareCard(canvas, post)).toBe(true)

    const texts = ctx.fillText.mock.calls.map((call) => call[0] as string)
    expect(texts).toContain(post.authorNickname)
    expect(texts.some((t) => post.title.startsWith(t) || t.startsWith(post.title))).toBe(true)
  })
})

describe('sharePostLink', () => {
  afterEach(() => {
    delete (navigator as unknown as { share?: unknown }).share
    delete (navigator as unknown as { clipboard?: unknown }).clipboard
  })

  it('navigator.share 를 지원하면 제목·URL 로 시스템 공유 시트를 띄운다', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    ;(navigator as unknown as { share: typeof share }).share = share

    const post = makePost()
    const result = await sharePostLink(post)

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: post.title, url: buildPostShareUrl(post.postId) })
  })

  it('navigator.share 를 지원하지 않으면 클립보드에 링크를 복사한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    ;(navigator as unknown as { clipboard: { writeText: typeof writeText } }).clipboard = { writeText }

    const result = await sharePostLink(makePost())

    expect(result).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(buildPostShareUrl(42))
  })

  it('공유 시트를 취소하면(AbortError) 클립보드로 폴백하지 않고 실패로 본다', async () => {
    const abortError = new DOMException('취소', 'AbortError')
    const share = vi.fn().mockRejectedValue(abortError)
    ;(navigator as unknown as { share: typeof share }).share = share
    const writeText = vi.fn()
    ;(navigator as unknown as { clipboard: { writeText: typeof writeText } }).clipboard = { writeText }

    const result = await sharePostLink(makePost())

    expect(result).toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('공유 시트도 클립보드도 없으면 실패로 본다', async () => {
    const result = await sharePostLink(makePost())
    expect(result).toBe('failed')
  })
})

describe('sharePostImage', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalToBlob = HTMLCanvasElement.prototype.toBlob

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx()) as unknown as typeof originalGetContext
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(new Blob(['fake-png'], { type: 'image/png' }))
    }) as unknown as typeof originalToBlob

    // jsdom 에는 없는 API라 캔버스→Blob 흐름을 테스트하려면 반드시 모킹해야 처리되지 않은 예외를 막을 수 있다.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
    HTMLCanvasElement.prototype.toBlob = originalToBlob
    delete (navigator as unknown as { share?: unknown }).share
    delete (navigator as unknown as { canShare?: unknown }).canShare
    vi.restoreAllMocks()
  })

  it('캔버스 2D 컨텍스트를 지원하지 않으면 failed 를 돌려준다', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof originalGetContext

    const result = await sharePostImage(makePost())

    expect(result).toBe('failed')
  })

  it('파일 공유를 지원하면 navigator.share 로 카드 이미지를 공유한다', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    ;(navigator as unknown as { share: typeof share }).share = share
    ;(navigator as unknown as { canShare: () => boolean }).canShare = () => true

    const result = await sharePostImage(makePost())

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('파일 공유를 지원하지 않으면 다운로드 링크 클릭으로 폴백한다', async () => {
    const result = await sharePostImage(makePost())

    expect(result).toBe('downloaded')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('공유 시트를 취소하면(AbortError) 다운로드로 폴백하지 않고 실패로 본다', async () => {
    const abortError = new DOMException('취소', 'AbortError')
    const share = vi.fn().mockRejectedValue(abortError)
    ;(navigator as unknown as { share: typeof share }).share = share
    ;(navigator as unknown as { canShare: () => boolean }).canShare = () => true

    const result = await sharePostImage(makePost())

    expect(result).toBe('failed')
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })
})
