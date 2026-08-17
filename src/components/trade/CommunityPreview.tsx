// 선택한 종목의 최근 커뮤니티 게시글 미리보기 — 더보기는 해당 종목으로 필터링된 커뮤니티로 이동한다
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { LinkButton } from '../ui/Button'
import { formatDateTime } from '../../lib/datetime'
import { toUserMessage } from '../../lib/errorMessages'
import { getPosts } from '../../services/communityService'
import type { Post } from '../../services/types'

const PREVIEW_SIZE = 1
const EXCERPT_MAX = 60

interface Props {
  instrumentId: number
  instrumentName: string
}

/** 목록 응답이 content 를 전부 담고 있어 상세를 따로 부르지 않고 여기서 잘라 쓴다. */
function toExcerpt(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX)}…` : flat
}

export function CommunityPreview({ instrumentId, instrumentName }: Props) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 종목을 바꾸면 이전 종목 게시글이 잠깐 보이지 않도록 즉시 로딩 상태로 되돌린다.
  useEffect(() => {
    let cancelled = false
    setPosts(null)
    setLoadError(null)
    getPosts({ instrumentId, size: PREVIEW_SIZE })
      .then((res) => {
        if (!cancelled) setPosts(res.content)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(toUserMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [instrumentId])

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-base font-semibold">{instrumentName} 커뮤니티</h3>
        </div>

        {loadError && <p className="mt-3 text-sm text-rose-300">{loadError}</p>}

        {posts === null && !loadError && (
          <div className="mt-4">
            <div className="skeleton h-12" />
          </div>
        )}

        {posts !== null && posts.length === 0 && (
          <p className="mt-4 text-sm leading-relaxed text-muted">
            아직 이 종목에 대한 게시글이 없습니다. 가장 먼저 이야기를 남겨보세요.
          </p>
        )}

        {posts !== null && posts.length > 0 && (
          <ul className="mt-4 space-y-2">
            {posts.map((post) => (
              <li key={post.postId}>
                <Link
                  to={`/community/${post.postId}`}
                  className="block rounded-xl bg-elevated p-4 transition-colors hover:bg-elevated/70"
                >
                  <p className="text-sm font-semibold text-ink">{post.title}</p>
                  <p className="mt-1 text-xs text-muted">{toExcerpt(post.content)}</p>
                  <p className="mt-1.5 text-[10px] text-muted">
                    {post.authorNickname} · {formatDateTime(post.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <LinkButton
          to={`/community?instrumentId=${instrumentId}`}
          size="sm"
          variant="ghost"
          className="mt-3"
        >
          더보기
        </LinkButton>
      </div>
    </Card>
  )
}
