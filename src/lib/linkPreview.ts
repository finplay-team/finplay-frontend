// 게시글 본문에서 첫 URL을 찾아 도메인 미리보기 카드에 쓸 정보로 뽑아낸다
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/

/** OG 메타데이터를 가져올 백엔드가 없어, 본문에 적힌 URL과 호스트명만으로 만드는 단순 미리보기. */
export interface LinkPreview {
  url: string
  host: string
}

/** content 안의 첫 URL을 찾는다. 없으면 null. */
export function extractLinkPreview(content: string): LinkPreview | null {
  const match = content.match(URL_PATTERN)
  if (!match) return null
  try {
    const url = new URL(match[0])
    return { url: url.href, host: url.host }
  } catch {
    return null
  }
}
