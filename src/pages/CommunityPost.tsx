// 커뮤니티 게시글 상세·수정·삭제와 댓글 목록·작성·삭제를 담당하는 페이지
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { formatDateTime } from '../lib/datetime'
import { isApiErrorCode, toUserMessage } from '../lib/errorMessages'
import {
  countComments,
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

/**
 * 부모·자식 어느 쪽이든 제거한다. 부모를 지우면 서버가 자식까지 CASCADE 로 지우므로
 * 화면에서도 가지째 걷어내야 서버 상태와 어긋나지 않는다.
 */
// 백엔드 PostCommentResponse 가 tombstone 시 채우는 값과 정확히 같아야 새로고침 후에도 화면이 안 바뀐다.
const TOMBSTONED_CONTENT = '삭제된 댓글입니다'
const TOMBSTONED_AUTHOR_DISPLAY = '(삭제됨)'

/**
 * 부모 댓글은 서버가 실제로 지우지 않고 내용·작성자만 치환한다(tombstone) — 대댓글은 그대로 남는다.
 * 대댓글(자식)은 서버가 실제로 하드 삭제하므로 목록에서 걷어낸다.
 */
function tombstoneOrRemoveComment(list: Comment[], commentId: number): Comment[] {
  return list.map((c) =>
    c.commentId === commentId
      ? { ...c, content: TOMBSTONED_CONTENT, authorNickname: TOMBSTONED_AUTHOR_DISPLAY }
      : { ...c, replies: c.replies.filter((r) => r.commentId !== commentId) },
  )
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
  /** 수정 시 함께 재전송할 종목 태그. 빠뜨리면 서버가 태그를 해제한다. */
  const [editInstrumentId, setEditInstrumentId] = useState<number | null>(null)
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
  /** 답글 대상 부모 댓글 id. null 이면 일반 댓글이다. */
  const [replyTo, setReplyTo] = useState<number | null>(null)
  /** 댓글·답글 작성 폼이 펼쳐져 있는지. "댓글 등록"이나 개별 답글 버튼으로 연다. */
  const [commentFormOpen, setCommentFormOpen] = useState(false)

  /** 대댓글 404 처럼 목록이 낡았을 때 서버 상태로 다시 맞춘다. */
  const reloadComments = useCallback(async () => {
    try {
      setComments(await getComments(postId))
    } catch {
      // 재조회 실패는 위에서 이미 문구를 띄운 뒤라 조용히 넘긴다.
    }
  }, [postId])

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
        setEditInstrumentId(p.instrumentId)
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

  /** 댓글 한 줄. 부모와 대댓글이 같은 모양이라 한 함수로 그린다(isReply 는 답글 버튼 유무만 가른다). */
  const renderComment = (c: Comment, isReply: boolean) => {
    const mine = member !== null && c.authorNickname === member.nickname
    const armed = armedCommentId === c.commentId
    return (
      <>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs text-muted">
            <span className="text-ink/80">{c.authorNickname}</span>
            <span className="px-2 text-muted/50">·</span>
            <span className="tabular">{formatDateTime(c.createdAt)}</span>
          </p>
          <span className="flex flex-none items-center gap-3 text-xs">
            {/* 대댓글에 답글을 달면 400 이므로 부모에만 버튼을 둔다. */}
            {!isReply && (
              <button
                onClick={() => {
                  if (replyTo === c.commentId) {
                    setReplyTo(null)
                    setCommentFormOpen(false)
                  } else {
                    setReplyTo(c.commentId)
                    setCommentFormOpen(true)
                  }
                }}
                className="text-muted transition-colors duration-300 hover:text-brand"
              >
                {replyTo === c.commentId ? '답글 취소' : '답글'}
              </button>
            )}
            {mine &&
              (armed ? (
                <span className="flex items-center gap-2">
                  {/* 부모를 지워도 서버는 실제로 지우지 않고 내용만 치환한다(tombstone). 답글은 그대로 남으므로
                      "답글까지 삭제된다"는 인상을 주지 않도록 안내한다. */}
                  <span className="text-muted">
                    {!isReply && c.replies.length > 0 ? '삭제해도 답글은 그대로 남아요.' : '정말 삭제할까요?'}
                  </span>
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
                  className="text-muted transition-colors duration-300 hover:text-brand"
                >
                  삭제
                </button>
              ))}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{c.content}</p>
      </>
    )
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (saving || !editTitle.trim() || !editContent.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      // PATCH 는 전체 교체다. instrumentId 를 빠뜨리면 서버가 기존 종목 태그를 해제하므로
      // 제목만 고치는 경우에도 현재 태그를 그대로 다시 실어 보낸다.
      const updated = await updatePost(postId, {
        title: editTitle.trim(),
        content: editContent.trim(),
        instrumentId: editInstrumentId,
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
      const target = post && post.instrumentId !== null ? `/community?instrumentId=${post.instrumentId}` : '/community'
      navigate(target, { replace: true })
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
      const created = await createComment(postId, {
        content: commentInput.trim(),
        parentCommentId: replyTo,
      })
      // createdAt 오름차순이라 새 댓글은 항상 마지막이다.
      // 대댓글이면 최상위가 아니라 해당 부모의 replies 끝에 붙어야 서버 구조와 같아진다.
      setComments((prev) =>
        replyTo === null
          ? [...prev, created]
          : prev.map((c) =>
              c.commentId === replyTo ? { ...c, replies: [...c.replies, created] } : c,
            ),
      )
      setCommentInput('')
      setReplyTo(null)
      setCommentFormOpen(false)
    } catch (err: unknown) {
      // 여기서의 404 는 "부모 댓글이 없거나 다른 게시물 소속"이라는 뜻이다.
      // 게시물이 사라진 것이 아니므로 절대 setGone(true) 하면 안 된다 — 글 전체가 날아간다.
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        setCommentError('답글을 달려던 댓글이 이미 삭제되었습니다. 목록을 새로 불러왔습니다.')
        setReplyTo(null)
        void reloadComments()
        return
      }
      setCommentError(
        toUserMessage(err, {
          VALIDATION_ERROR: replyTo === null
            ? '댓글 내용을 다시 확인해 주세요.'
            : '대댓글에는 다시 답글을 달 수 없습니다.',
        }),
      )
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleCommentDelete = async (commentId: number) => {
    setCommentDeleteError(null)
    try {
      await deleteComment(commentId)
      setComments((prev) => tombstoneOrRemoveComment(prev, commentId))
    } catch (err: unknown) {
      if (isApiErrorCode(err, 'NOT_FOUND')) {
        // 대댓글이 이미 하드 삭제된 경우다(부모는 tombstone 이라 404 가 나지 않는다). 목록에서 치운다.
        setComments((prev) => tombstoneOrRemoveComment(prev, commentId))
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
          to={post.instrumentId !== null ? `/community?instrumentId=${post.instrumentId}` : '/community'}
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
                <div className="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-6">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    수정
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setDeleteArmed(true)}>
                    삭제
                  </Button>
                </div>
              )}
              {deleteError && <p className="mt-3 text-sm text-rose-300">{deleteError}</p>}

              <ConfirmDialog
                open={deleteArmed}
                title="정말 삭제할까요?"
                message="삭제하면 되돌릴 수 없습니다."
                confirmLabel={deleting ? '삭제 중…' : '삭제'}
                busy={deleting}
                onConfirm={handleDelete}
                onCancel={() => setDeleteArmed(false)}
              />
            </article>
          )}
        </Card>

        {/* 댓글 — 페이지네이션이 없어 전부 렌더한다. */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">
              댓글 <span className="text-brand tabular">{countComments(comments)}</span>
            </h2>
            {/* 답글 취소는 그 댓글 자신의 "답글 취소" 버튼이 담당하니, 여기는 일반 댓글 작성일 때만 보여준다. */}
            {(!commentFormOpen || replyTo === null) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (commentFormOpen) {
                    setCommentFormOpen(false)
                    setReplyTo(null)
                    setCommentInput('')
                    setCommentError(null)
                  } else {
                    setReplyTo(null)
                    setCommentFormOpen(true)
                  }
                }}
              >
                {commentFormOpen ? '취소' : '댓글 등록'}
              </Button>
            )}
          </div>

          {commentDeleteError && <p className="mt-4 text-sm text-rose-300">{commentDeleteError}</p>}

          {comments.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {comments.map((c) => (
                <li key={c.commentId} className="px-5 py-4">
                  {renderComment(c, false)}

                  {/*
                    대댓글은 부모 안에 중첩한다. 중첩은 1단계뿐이라 자식의 replies 는 항상 비어 있어
                    재귀를 돌 필요가 없다. 답글 버튼도 자식에는 달지 않는다(달면 400 이다).
                  */}
                  {c.replies.length > 0 && (
                    <ul className="mt-3 space-y-3 border-l border-line pl-4">
                      {c.replies.map((r) => (
                        <li key={r.commentId}>{renderComment(r, true)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {commentFormOpen && (
          <Card className="mt-6" innerClassName="p-6">
            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">
                  {replyTo === null ? '댓글 남기기' : '답글 남기기'}
                </span>
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
              {replyTo !== null && (
                <p className="flex items-center gap-2 text-xs text-brand">
                  답글을 다는 중입니다.
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded-full bg-white/[0.06] px-2 py-0.5 text-ink"
                  >
                    일반 댓글로
                  </button>
                </p>
              )}
              {commentError && <p className="text-sm text-rose-300">{commentError}</p>}
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={commentSubmitting || !commentInput.trim()}>
                  {commentSubmitting ? '등록 중…' : replyTo === null ? '댓글 등록' : '답글 등록'}
                </Button>
              </div>
            </form>
          </Card>
          )}
        </section>
      </div>
    </div>
  )
}
