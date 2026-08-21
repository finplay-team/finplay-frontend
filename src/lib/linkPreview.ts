// 게시글 본문에서 URL을 찾아 도메인 미리보기 카드나 하이퍼링크로 쓸 정보로 뽑아낸다
// 한글은 공백 없이 URL 뒤에 바로 붙는 경우가 흔해(예: "https://example.com입니다") URL 문자 집합에서 제외한다.
const URL_PATTERN_SOURCE = 'https?://[^\\s<>"\'`ᄀ-ᇿ぀-ヿ㄰-㆏가-힣]+'
const URL_PATTERN = new RegExp(URL_PATTERN_SOURCE)
// 문장 부호로 감싸거나 마침표로 끝맺은 링크("(https://example.com)", "https://example.com.")에서
// URL 이 아닌 꼬리 문자를 뗀다.
const TRAILING_PUNCTUATION = /[)\]}>.,!?;:'"]+$/
// 구분 공백 없이 두 링크를 붙여 쓰면("https://a.comhttps://b.com") 위 문자 집합만으로는 잘라낼 수
// 없어, 첫 글자 다음부터 또 다른 프로토콜이 나오는 지점에서 끊는다.
const EMBEDDED_PROTOCOL = /https?:\/\//i

/** raw 매치에서 꼬리 구두점과, 공백 없이 이어 붙은 다음 URL을 잘라낸 실제 URL 문자열. */
function trimUrlMatch(raw: string): string {
  const embeddedIndex = raw.slice(1).search(EMBEDDED_PROTOCOL)
  const cut = embeddedIndex === -1 ? raw : raw.slice(0, embeddedIndex + 1)
  return cut.replace(TRAILING_PUNCTUATION, '')
}

/** OG 메타데이터를 가져올 백엔드가 없어, 본문에 적힌 URL과 호스트명만으로 만드는 단순 미리보기. */
export interface LinkPreview {
  url: string
  host: string
}

/** content 안의 첫 URL을 찾는다. 없으면 null. */
export function extractLinkPreview(content: string): LinkPreview | null {
  const match = content.match(URL_PATTERN)
  if (!match) return null
  const trimmed = trimUrlMatch(match[0])
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return { url: url.href, host: url.host }
  } catch {
    return null
  }
}

/** 하이퍼링크로 그릴 조각(url 있음)과 그냥 텍스트로 그릴 조각(url 없음)이 섞인 배열. */
export interface LinkifiedPart {
  text: string
  url?: string
}

/** content 를 순서대로 훑어 URL 부분과 나머지 텍스트 부분으로 나눈다. URL이 없으면 전체가 텍스트 한 조각이다. */
export function linkifyContent(content: string): LinkifiedPart[] {
  const parts: LinkifiedPart[] = []
  let lastIndex = 0
  for (const match of content.matchAll(new RegExp(URL_PATTERN_SOURCE, 'g'))) {
    const start = match.index
    const raw = match[0]
    const trimmed = trimUrlMatch(raw)
    if (!trimmed) continue

    let href: string | null = null
    try {
      href = new URL(trimmed).href
    } catch {
      href = null
    }
    if (!href) continue

    if (start > lastIndex) parts.push({ text: content.slice(lastIndex, start) })
    parts.push({ text: trimmed, url: href })
    lastIndex = start + trimmed.length
  }
  if (lastIndex < content.length) parts.push({ text: content.slice(lastIndex) })
  return parts.length > 0 ? parts : [{ text: content }]
}
