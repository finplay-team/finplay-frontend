// 게시글 본문에서 첫 URL을 찾아 도메인 미리보기 카드에 쓸 정보로 뽑아낸다
// 한글은 공백 없이 URL 뒤에 바로 붙는 경우가 흔해(예: "https://example.com입니다") URL 문자 집합에서 제외한다.
const URL_PATTERN = /https?:\/\/[^\s<>"'`ᄀ-ᇿ぀-ヿ㄰-㆏가-힣]+/
// 문장 부호로 감싸거나 마침표로 끝맺은 링크("(https://example.com)", "https://example.com.")에서
// URL 이 아닌 꼬리 문자를 뗀다.
const TRAILING_PUNCTUATION = /[)\]}>.,!?;:'"]+$/

/** OG 메타데이터를 가져올 백엔드가 없어, 본문에 적힌 URL과 호스트명만으로 만드는 단순 미리보기. */
export interface LinkPreview {
  url: string
  host: string
}

/** content 안의 첫 URL을 찾는다. 없으면 null. */
export function extractLinkPreview(content: string): LinkPreview | null {
  const match = content.match(URL_PATTERN)
  if (!match) return null
  const trimmed = match[0].replace(TRAILING_PUNCTUATION, '')
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return { url: url.href, host: url.host }
  } catch {
    return null
  }
}
