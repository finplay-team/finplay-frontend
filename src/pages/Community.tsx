// 커뮤니티 게시글 목록·페이지 이동·글쓰기 폼을 담당하는 페이지
import { useEffect, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { AttachedImage } from '../components/community/AttachedImage'
import { TradeShareCard } from '../components/community/TradeShareCard'
import { LikeButton } from '../components/community/LikeButton'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Layers } from '../components/ui/icons'
import { formatDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import {
  createPost,
  getPostImageBlobUrl,
  getPosts,
  likePost,
  unlikePost,
  uploadPostImage,
} from '../services/communityService'
import { useInstruments } from '../hooks/useInstruments'
import type { Post, PostPage, PostSort } from '../services/types'

const SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'popular', label: '인기순' },
  { value: 'latest', label: '최신순' },
]

const PAGE_SIZE = 10
const TITLE_MAX = 100
const CONTENT_MAX = 5000
const EXCERPT_MAX = 140
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const inputClass =
  'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15'

/** 목록 응답이 content 를 전부 담고 있어 상세를 따로 부르지 않고 여기서 잘라 쓴다. */
function toExcerpt(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX)}…` : flat
}

export function Community() {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<PostSort>('latest')
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<PostPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** 좋아요 처리 중인 게시글 id 집합 — 게시글 단위로 막아야 다른 카드의 좋아요가 함께 잠기지 않는다. */
  const [likeBusy, setLikeBusy] = useState<ReadonlySet<number>>(new Set())
  const [likeErrors, setLikeErrors] = useState<Record<number, string>>({})

  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /** 선택한 사진의 로컬 미리보기. 업로드 성공 여부와 무관하게 "사진을 골랐다"는 사실을 바로 보여준다. */
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  /** 업로드가 끝나 게시물에 실어 보낼 수 있는 이미지 id. 업로드 중이거나 실패했으면 null. */
  const [imageId, setImageId] = useState<number | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  /**
   * 첨부할 매매 카드의 체결 id. 포트폴리오·매도 직후 화면에서 navigate state 로 들고 온다.
   * 이미지와 동시에 첨부할 수 없어(백엔드 제약) 사진 첨부 UI와 배타적으로 보여준다.
   */
  const [sharedTradeId, setSharedTradeId] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  /**
   * 지금 보고 있는 종목 커뮤니티. null 이면 전체(미태그 포함) 피드. 모의투자 페이지의
   * 더보기가 ?instrumentId= 로 링크하면 이 값이 채워진다. 종목을 직접 바꾸는 UI는 없다 —
   * 종목별 커뮤니티는 그 종목 화면에서 들어오는 진입점이라 화면에 머무는 동안 고정이다.
   * 글쓰기 폼도 종목을 따로 고르지 않고 이 값을 그대로 태그로 써서, 지금 보고 있는
   * 커뮤니티에 글을 남긴다는 맥락을 그대로 유지한다.
   */
  const [filterInstrumentId] = useState<number | null>(() => {
    const raw = searchParams.get('instrumentId')
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  })

  /** 종목 배지 표시용 — 글이 하나도 없어도(목록에서 이름을 뽑을 수 없어도) 어느 종목인지 알 수 있게 한다. */
  const { index } = useInstruments()
  const filterInstrument =
    filterInstrumentId !== null ? (index?.byId.get(filterInstrumentId) ?? null) : null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getPosts({ page, size: PAGE_SIZE, instrumentId: filterInstrumentId, sort })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(toUserMessage(e, { VALIDATION_ERROR: '잘못된 페이지 요청입니다.' }))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, reloadKey, filterInstrumentId, sort])

  /** 정렬을 바꾸면 첫 페이지부터 다시 본다 — 이전 정렬의 2페이지가 남아 있으면 헷갈린다. */
  const handleSortChange = (next: PostSort) => {
    if (next === sort) return
    setSort(next)
    setPage(0)
  }

  /**
   * 낙관적 업데이트: 클릭 즉시 카운트·상태를 바꾸고 서버를 부른다. 실패하면 되돌리고
   * 그 카드에만 오류 문구를 남긴다(다른 카드는 영향받지 않는다).
   * 카드 전체가 상세로 가는 Link 라서 클릭이 새 페이지로 튀지 않게 막아야 한다.
   */
  const handleToggleLike = async (post: Post, e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (likeBusy.has(post.postId)) return

    const wasLiked = post.likedByMe
    const prevCount = post.likeCount
    const nextLiked = !wasLiked
    const nextCount = prevCount + (nextLiked ? 1 : -1)

    const applyLike = (postId: number, liked: boolean, count: number) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              content: prev.content.map((p) =>
                p.postId === postId ? { ...p, likedByMe: liked, likeCount: count } : p,
              ),
            }
          : prev,
      )
    }

    setLikeBusy((prev) => new Set(prev).add(post.postId))
    setLikeErrors((prev) => {
      if (!(post.postId in prev)) return prev
      const next = { ...prev }
      delete next[post.postId]
      return next
    })
    applyLike(post.postId, nextLiked, nextCount)

    try {
      if (nextLiked) {
        const res = await likePost(post.postId)
        applyLike(post.postId, res.likedByMe, res.likeCount)
      } else {
        await unlikePost(post.postId)
      }
    } catch (err: unknown) {
      applyLike(post.postId, wasLiked, prevCount)
      setLikeErrors((prev) => ({ ...prev, [post.postId]: toUserMessage(err) }))
    } finally {
      setLikeBusy((prev) => {
        const next = new Set(prev)
        next.delete(post.postId)
        return next
      })
    }
  }

  // 로컬 미리보기용 object URL 은 바뀌거나(재선택) 페이지를 벗어날 때 해제해야 메모리가 새지 않는다.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  /**
   * 수익 인증 카드에서 "커뮤니티에 바로 올리기"로 넘어온 진입점. 이미지는 이미 업로드가 끝나
   * imageId 만 navigate state 로 들고 왔으므로, 로컬 파일 대신 업로드된 이미지를 blob 으로 불러와
   * 미리보기로 쓴다. 마운트 시 1회만 확인한다 — 폼을 쓰다가 state 가 남아 있어도 다시 덮어쓰지 않는다.
   */
  useEffect(() => {
    const attachedImageId = (location.state as { attachedImageId?: number } | null)?.attachedImageId
    if (attachedImageId === undefined) return
    let cancelled = false
    setFormOpen(true)
    setImageId(attachedImageId)
    getPostImageBlobUrl(attachedImageId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setImagePreviewUrl(url)
      })
      .catch(() => {
        // 미리보기만 실패한 것이므로 imageId 는 유지한다 — 등록 시에는 여전히 이 이미지가 첨부된다.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 수익 인증 카드(포트폴리오 체결내역·매도 직후)에서 "수익 인증 카드로 공유하기"로 넘어온 진입점.
   * 이미지와 달리 미리 업로드할 것이 없어 tradeId 만 들고 있다가 등록 시 그대로 실어 보낸다.
   * 마운트 시 1회만 확인한다 — 폼을 쓰다가 state 가 남아 있어도 다시 덮어쓰지 않는다.
   */
  useEffect(() => {
    const tradeId = (location.state as { sharedTradeId?: number } | null)?.sharedTradeId
    if (tradeId === undefined) return
    setFormOpen(true)
    setSharedTradeId(tradeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSubmit =
    title.trim().length > 0 && content.trim().length > 0 && !submitting && !imageUploading

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // 같은 파일을 다시 골라도 onChange 가 뜨도록 초기화
    if (!file) return

    setImageError(null)
    if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
      setImageError('사진 파일만 첨부할 수 있어요 (JPEG, PNG, WEBP).')
      return
    }
    if (file.size === 0) {
      setImageError('빈 파일은 첨부할 수 없어요.')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError('사진 용량이 너무 커요. 5MB 이하로 줄여서 다시 올려 주세요.')
      return
    }

    setImagePreviewUrl(URL.createObjectURL(file))
    setImageId(null)
    setImageUploading(true)
    try {
      const uploaded = await uploadPostImage(file)
      setImageId(uploaded.imageId)
    } catch (err: unknown) {
      setImagePreviewUrl(null)
      setImageError(
        toUserMessage(err, { VALIDATION_ERROR: '허용하지 않는 사진 형식이거나 5MB를 넘었어요.' }),
      )
    } finally {
      setImageUploading(false)
    }
  }

  const handleImageRemove = () => {
    setImagePreviewUrl(null)
    setImageId(null)
    setImageError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setFormError(null)
    try {
      // 이미지와 매매 카드는 동시에 첨부할 수 없다(백엔드 제약) — sharedTradeId 가 있으면 그쪽만 보낸다.
      await createPost({
        title: title.trim(),
        content: content.trim(),
        instrumentId: filterInstrumentId,
        ...(sharedTradeId !== null ? { sharedTradeId } : { imageId }),
      })
      setTitle('')
      setContent('')
      setImagePreviewUrl(null)
      setImageId(null)
      setImageError(null)
      setSharedTradeId(null)
      setFormOpen(false)
      // 새 글은 최신순 목록의 첫 페이지에 있다.
      if (page !== 0) setPage(0)
      else setReloadKey((k) => k + 1)
    } catch (err: unknown) {
      setFormError(
        toUserMessage(err, {
          VALIDATION_ERROR: '제목·내용 또는 선택한 종목을 다시 확인해 주세요.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const totalPages = Math.max(1, data?.totalPages ?? 1)

  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 pb-24 pt-28 md:pt-32">
      <div aria-hidden className="orb -left-24 top-16 h-72 w-72 animate-float-orb" />

      <div className="relative mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Eyebrow>커뮤니티</Eyebrow>
              {filterInstrument && (
                <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-brand">
                  {filterInstrument.name} · {filterInstrument.symbol}
                </span>
              )}
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
              매매 경험을 나누는 곳
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {data ? `게시글 ${data.totalElements.toLocaleString('ko-KR')}개` : '게시글을 불러오는 중입니다.'}
            </p>
          </div>
          {/* 글이 없으면 본문 빈 상태의 "첫 글 쓰기"만 보여준다 — 위아래 버튼이 겹쳐 보이지 않게.
              단, 글쓰기 폼이 열려 있는 동안엔(그 사이 글이 지워지는 등) 닫을 방법이 있어야 하니 항상 보여준다. */}
          {(formOpen || (data !== null && data.content.length > 0)) && (
            <Button variant={formOpen ? 'ghost' : 'primary'} size="sm" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? '닫기' : '글쓰기'}
            </Button>
          )}
        </header>

        {formOpen && (
          <Card className="mt-8" accent="brand" innerClassName="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">제목</span>
                  <span className="text-xs text-muted tabular">
                    {title.length}/{TITLE_MAX}
                  </span>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  placeholder="제목을 입력해 주세요"
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">내용</span>
                  <span className="text-xs text-muted tabular">
                    {content.length}/{CONTENT_MAX}
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={CONTENT_MAX}
                  rows={7}
                  placeholder="이 종목에 대한 생각을 자유롭게 남겨보세요"
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">
                    {sharedTradeId !== null ? '매매 카드' : '사진 (선택)'}
                  </span>
                  {imageUploading && <span className="text-xs text-muted">업로드 중…</span>}
                </div>
                {/* 이미지와 매매 카드는 같은 게시물에 동시에 붙지 못한다(백엔드 제약) — 한쪽만 보여준다. */}
                {sharedTradeId !== null ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
                    <p className="text-sm text-ink">이 매매의 수익 인증 카드가 함께 등록돼요.</p>
                    <button
                      type="button"
                      onClick={() => setSharedTradeId(null)}
                      className="text-xs text-muted underline underline-offset-2 transition-colors duration-300 hover:text-brand"
                    >
                      제거
                    </button>
                  </div>
                ) : imagePreviewUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreviewUrl}
                      alt="첨부한 사진 미리보기"
                      className="h-32 w-32 rounded-2xl border border-line object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleImageRemove}
                      aria-label="사진 삭제"
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-surface"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted transition-colors duration-300 hover:border-brand hover:text-brand">
                    사진 추가하기
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleImageChange(e)}
                      className="hidden"
                    />
                  </label>
                )}
                {sharedTradeId === null && (
                  <p className="mt-1.5 text-xs text-muted">
                    JPEG, PNG, WEBP만 되고 5MB까지 올릴 수 있어요. 한 장만 첨부할 수 있어요.
                  </p>
                )}
                {imageError && <p className="mt-1.5 text-sm text-rose-300">{imageError}</p>}
              </div>

              {/* gain(=상승 적색) 은 시세용 토큰이다. 폼 오류는 Signup·Field 와 같은 rose 를 쓴다 */}
              {formError && <p className="text-sm text-rose-300">{formError}</p>}

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!canSubmit}>
                  {submitting ? '등록 중…' : '등록'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {!formOpen && (
          <>
            <div
              role="group"
              aria-label="정렬 방식"
              className="mt-8 inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1"
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSortChange(opt.value)}
                  aria-pressed={sort === opt.value}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-300 ${
                    sort === opt.value ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <section className="mt-4 space-y-4">
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} innerClassName="p-6">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="mt-3 skeleton h-3 w-full" />
                    <div className="mt-2 skeleton h-3 w-4/5" />
                    <div className="mt-5 skeleton h-2.5 w-32" />
                  </Card>
                ))}

              {!loading && loadError && (
                <Card innerClassName="p-8 text-center">
                  <p className="text-sm text-ink">{loadError}</p>
                  <div className="mt-5 flex justify-center">
                    <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
                      다시 시도
                    </Button>
                  </div>
                </Card>
              )}

              {!loading && !loadError && data?.content.length === 0 && (
                <Card accent="brand" innerClassName="px-6 py-16 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    <Layers width={22} height={22} />
                  </span>
                  <p className="mt-5 font-display text-lg font-semibold text-ink">
                    아직 게시글이 없습니다
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                    왜 사고 왜 팔았는지 적어 두면 나중에 같은 판단을 다시 볼 수 있습니다. 첫 글을 남겨
                    보세요.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button withIcon onClick={() => setFormOpen(true)}>
                      첫 글 쓰기
                    </Button>
                  </div>
                </Card>
              )}

              {!loading &&
                !loadError &&
                data?.content.map((post) => (
                  <Link key={post.postId} to={`/community/${post.postId}`} className="block">
                    <Card className="transition-transform duration-500 ease-spring hover:-translate-y-0.5">
                      <div className="p-6">
                        {/* symbol·name 이 응답에 함께 와서 종목 캐시 조인 없이 배지를 그릴 수 있다. */}
                        {post.instrumentId !== null && (
                          <span className="mb-2 inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-brand">
                            {post.instrumentName} · {post.instrumentSymbol}
                          </span>
                        )}
                        <h2 className="font-display text-lg font-semibold text-ink">{post.title}</h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                          {toExcerpt(post.content)}
                        </p>
                        {/* 매매 카드와 사진은 한 게시물에 동시에 붙지 않는다(서로 배타적). */}
                        {post.sharedTrade !== null ? (
                          <TradeShareCard trade={post.sharedTrade} className="mt-3" />
                        ) : (
                          post.imageId !== null && (
                            <AttachedImage
                              imageId={post.imageId}
                              alt={`${post.title} 첨부 사진`}
                              className="mt-3 h-40 w-full rounded-2xl object-cover"
                            />
                          )
                        )}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted">
                            <span className="text-ink/80">{post.authorNickname}</span>
                            <span className="px-2 text-muted/50">·</span>
                            <span className="tabular">{formatDateTime(post.createdAt)}</span>
                          </p>
                          <LikeButton
                            liked={post.likedByMe}
                            count={post.likeCount}
                            busy={likeBusy.has(post.postId)}
                            onClick={(e) => void handleToggleLike(post, e)}
                          />
                        </div>
                        {likeErrors[post.postId] && (
                          <p className="mt-2 text-xs text-rose-300">{likeErrors[post.postId]}</p>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
            </section>

            {!loading && !loadError && data && data.content.length > 0 && (
              <nav className="mt-10 flex items-center justify-center gap-4">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  이전
                </Button>
                <span className="text-sm text-muted tabular">
                  {data.page + 1} / {totalPages}
                </span>
                <Button variant="ghost" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>
                  다음
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
