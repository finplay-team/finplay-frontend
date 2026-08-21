// 본문에서 첫 URL을 뽑아내는 extractLinkPreview, 본문을 텍스트·링크 조각으로 나누는 linkifyContent 를 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { extractLinkPreview, linkifyContent } from './linkPreview'

describe('extractLinkPreview', () => {
  it('URL이 없으면 null', () => {
    expect(extractLinkPreview('오늘도 좋은 하루였습니다.')).toBeNull()
  })

  it('본문 속 URL을 찾아 host와 정규화된 url을 반환한다', () => {
    expect(extractLinkPreview('참고 자료: https://example.com/post?id=1 확인해 주세요')).toEqual({
      url: 'https://example.com/post?id=1',
      host: 'example.com',
    })
  })

  /** 한글 조사가 공백 없이 URL 뒤에 바로 붙는 흔한 문장 — 조사까지 host에 섞여 들어가면 안 된다. */
  it('URL 뒤에 공백 없이 붙은 한글 조사는 URL에서 제외한다', () => {
    expect(extractLinkPreview('출처는 https://example.com입니다')).toEqual({
      url: 'https://example.com/',
      host: 'example.com',
    })
  })

  it('괄호로 감싼 링크는 닫는 괄호를 떼어낸다', () => {
    expect(extractLinkPreview('참고 (https://example.com) 링크입니다')).toEqual({
      url: 'https://example.com/',
      host: 'example.com',
    })
  })

  it('마침표로 끝맺은 문장의 링크는 마침표를 떼어낸다', () => {
    expect(extractLinkPreview('여기서 확인하세요. https://example.com.')).toEqual({
      url: 'https://example.com/',
      host: 'example.com',
    })
  })
})

describe('linkifyContent', () => {
  it('URL이 없으면 전체가 텍스트 한 조각이다', () => {
    expect(linkifyContent('오늘도 좋은 하루였습니다.')).toEqual([{ text: '오늘도 좋은 하루였습니다.' }])
  })

  it('본문 속 URL을 앞뒤 텍스트와 분리된 링크 조각으로 만든다', () => {
    expect(linkifyContent('영상은 https://youtu.be/abc123 여기 있어요')).toEqual([
      { text: '영상은 ' },
      { text: 'https://youtu.be/abc123', url: 'https://youtu.be/abc123' },
      { text: ' 여기 있어요' },
    ])
  })

  it('URL 뒤에 공백 없이 붙은 한글 조사는 링크에서 제외하고 다음 텍스트 조각에 남긴다', () => {
    expect(linkifyContent('출처는 https://example.com입니다')).toEqual([
      { text: '출처는 ' },
      { text: 'https://example.com', url: 'https://example.com/' },
      { text: '입니다' },
    ])
  })

  it('본문에 여러 URL이 있으면 모두 링크 조각이 된다', () => {
    expect(linkifyContent('https://a.com 그리고 https://b.com')).toEqual([
      { text: 'https://a.com', url: 'https://a.com/' },
      { text: ' 그리고 ' },
      { text: 'https://b.com', url: 'https://b.com/' },
    ])
  })
})
