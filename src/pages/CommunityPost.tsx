// 커뮤니티 게시글 상세·수정·삭제와 댓글 목록·작성·삭제를 담당하는 페이지
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { formatDateTime } from '../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import {
  createComment,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  updatePost,
} from '../services/communityService'
import type { Comment, Post } from '../services/types'

const TITLE_MAX = 100
const CONTENT_MAX = 5000
const COMMENT_MAX = 1000

const inputClass =
  'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15'

/** 서버는 수정 시각을 항상 채워 주므로 생성 시각과 다를 때만 수정됨으로 본다. */
function isEdited(post: Post): boolean {
  return post.updatedAt !== post.createdAt
}

export function CommunityPost() {
  const params = useParams()
  const postId = Number(params.postId)
  const navigate = useNavigate()
  const { member } = useAuth()

  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [commentInput, setCommentInput] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [armedCommentId, setArmedCommentId] = useState<number | null>(null)
  const [commentDeleteError, setCommentDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isInteger(postId) || postId <= 0) {
      setGone(true)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setGone(false)
    Promise.all([getPost(postId), getComments(postId)])
      .then(([p, c]) => {
        if (cancelled) return
        setPost(p)
        setComments(c)
        setEditTitle(p.title)
        setEditContent(p.content)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (isApiErrorCode(e, 'NOT_FOUND')) setGone(true)
        else setLoadError(toUserMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  // authorId 가 없어 닉네임 비교가 유일한 신호다. 최종 권위는 서버의 403 FORBIDDEN 이다.
  const isMine = post !== null && member !== null && post.authorNickname === member.nickname

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (saving || !editTitle.trim() || !editContent.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      // PATCH 는 전체 교체라 두 필드를 항상 함께 보낸다.
      const updated = await updatePost(postId, {
        title: editTitle.trim(),
        content: editContent.trim(),
      })
      setPost(updated)
      setEditing(false)
    } catch (err: unknown) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        setGone(true)
        return
      }
      setEditError(
        toUserMessage(err, {
          FORBIDDEN: '내가 쓴 글만 수정할 수 있습니다.',
          VALIDATION_ERROR: '제목과 내용을 다시 확인해 주세요.',
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePost(postId)
      navigate('/community', { replace: true })
    } catch (err: unknown) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        setGone(true)
        return
      }
      setDeleteArmed(false)
      setDeleteError(toUserMessage(err, { FORBIDDEN: '내가 쓴 글만 삭제할 수 있습니다.' }))
    } finally {
      setDeleting(false)
    }
  }

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (commentSubmitting || !commentInput.trim()) return
    setCommentSubmitting(true)
    setCommentError(null)
    try {
      const created = await createComment(postId, { content: commentInput.trim() })
      // createdAt 오름차순이라 새 댓글은 항상 마지막이다.
      setComments((prev) => [...prev, created])
      setCommentInput('')
    } catch (err: unknown) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        setGone(true)
        return
      }
      setCommentError(
        toUserMessage(err, { VALIDATION_ERROR: '댓글 내용을 다시 확인해 주세요.' }),
      )
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleCommentDelete = async (commentId: number) => {
    setCommentDeleteError(null)
    try {
      await deleteComment(commentId)
      setComments((prev) => prev.filter((c) => c.commentId !== commentId))
    } catch (err: unknown) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        // 이미 지워진 댓글이므로 목록에서만 치운다.
        setComments((prev) => prev.filter((c) => c.commentId !== commentId))
        return
      }
      setCommentDeleteError(
        toUserMessage(err, { FORBIDDEN: '내가 쓴 댓글만 삭제할 수 있습니다.' }),
      )
    } finally {
      setArmedCommentId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] px-4 pt-28 md:pt-32">
        <p className="py-24 text-center text-sm text-muted">불러오는 중입니다…</p>
      </div>
    )
  }

  if (gone || loadError || !post) {
    return (
      <div className="min-h-[100dvh] px-4 pb-24 pt-28 md:pt-32">
        <div className="mx-auto max-w-xl">
          <Card innerClassName="p-10 text-center">
            <p className="font-display text-xl font-semibold text-ink">
              {gone ? '삭제되었거나 없는 게시글입니다' : '게시글을 불러올 수 없습니다'}
            </p>
            <p className="mt-3 text-sm text-muted">
              {gone ? '목록에서 다른 글을 확인해 보세요.' : loadError}
            </p>
            <div className="mt-7 flex justify-center">
              <LinkButton to="/community" withIcon>
                커뮤니티로 돌아가기
              </LinkButton>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -right-24 top-20 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-3xl">
        <Link
          to="/community"
          className="text-sm text-muted transition-colors duration-300 hover:text-brand"
        >
          ← 커뮤니티
        </Link>

        <Card className="mt-5" accent="brand">
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4 p-6">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">제목</span>
                  <span className="text-xs text-muted tabular">
                    {editTitle.length}/{TITLE_MAX}
                  </span>
                </div>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">내용</span>
                  <span className="text-xs text-muted tabular">
                    {editContent.length}/{CONTENT_MAX}
                  </span>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  maxLength={CONTENT_MAX}
                  rows={10}
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              <p className="text-xs text-muted">
                제목과 내용이 모두 저장됩니다. 둘 중 하나라도 비우면 저장할 수 없습니다.
              </p>
              {editError && <p className="text-sm text-rose-300">{editError}</p>}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setEditError(null)
                    setEditTitle(post.title)
                    setEditContent(post.content)
                  }}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !editTitle.trim() || !editContent.trim()}
                >
                  {saving ? '저장 중…' : '저장'}
                </Button>
              </div>
            </form>
          ) : (
            <article className="p-6 md:p-8">
              <h1 className="font-display text-2xl font-semibold leading-snug text-ink md:text-3xl">
                {post.title}
              </h1>
              <p className="mt-3 text-xs text-muted">
                <span className="text-ink/80">{post.authorNickname}</span>
                <span className="px-2 text-muted/50">·</span>
                <span className="tabular">{formatDateTime(post.createdAt)}</span>
                {isEdited(post) && (
                  <>
                    <span className="px-2 text-muted/50">·</span>
                    <span className="text-brand">수정됨 {formatDateTime(post.updatedAt)}</span>
                  </>
                )}
              </p>

              <p className="mt-7 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90">
                {post.content}
              </p>

              {isMine && (
                <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-6">
                  <Button variant="ghost" onClick={() => setEditing(true)}>
                    수정
                  </Button>
                  {deleteArmed ? (
                    <>
                      <span className="text-sm text-muted">정말 삭제할까요?</span>
                      <Button onClick={handleDelete} disabled={deleting}>
                        {deleting ? '삭제 중…' : '삭제'}
                      </Button>
                      <Button variant="ghost" onClick={() => setDeleteArmed(false)}>
                        취소
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setDeleteArmed(true)}>
                      삭제
                    </Button>
                  )}
                </div>
              )}
              {deleteError && <p className="mt-3 text-sm text-rose-300">{deleteError}</p>}
            </article>
          )}
        </Card>

        {/* 댓글 — 페이지네이션이 없어 전부 렌더한다. */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-ink">
            댓글 <span className="text-brand tabular">{comments.length}</span>
          </h2>

          <Card className="mt-4" innerClassName="p-6">
            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">댓글 남기기</span>
                <span className="text-xs text-muted tabular">
                  {commentInput.length}/{COMMENT_MAX}
                </span>
              </div>
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                maxLength={COMMENT_MAX}
                rows={3}
                placeholder="댓글을 입력해 주세요"
                className={`${inputClass} resize-y leading-relaxed`}
              />
              {commentError && <p className="text-sm text-rose-300">{commentError}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={commentSubmitting || !commentInput.trim()}>
                  {commentSubmitting ? '등록 중…' : '댓글 등록'}
                </Button>
              </div>
            </form>
          </Card>

          {commentDeleteError && <p className="mt-4 text-sm text-rose-300">{commentDeleteError}</p>}

          {comments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">아직 댓글이 없습니다.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {comments.map((c) => {
                const mine = member !== null && c.authorNickname === member.nickname
                const armed = armedCommentId === c.commentId
                return (
                  <li key={c.commentId} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-xs text-muted">
                        <span className="text-ink/80">{c.authorNickname}</span>
                        <span className="px-2 text-muted/50">·</span>
                        <span className="tabular">{formatDateTime(c.createdAt)}</span>
                      </p>
                      {mine &&
                        (armed ? (
                          <span className="flex flex-none items-center gap-2 text-xs">
                            <span className="text-muted">정말 삭제할까요?</span>
                            <button
                              onClick={() => handleCommentDelete(c.commentId)}
                              className="rounded-full bg-brand px-3 py-1 font-medium text-brand-ink"
                            >
                              삭제
                            </button>
                            <button
                              onClick={() => setArmedCommentId(null)}
                              className="rounded-full bg-white/[0.06] px-3 py-1 text-ink"
                            >
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setArmedCommentId(c.commentId)}
                            className="flex-none text-xs text-muted transition-colors duration-300 hover:text-brand"
                          >
                            삭제
                          </button>
                        ))}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                      {c.content}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
