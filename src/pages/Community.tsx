// 커뮤니티 게시글 목록·페이지 이동·글쓰기 폼을 담당하는 페이지
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Layers } from '../components/ui/icons'
import { formatDateTime } from '../lib/datetime'
import { toUserMessage } from '../lib/errorMessages'
import { createPost, getPosts } from '../services/communityService'
import { useInstruments } from '../hooks/useInstruments'
import type { PostPage } from '../services/types'

const PAGE_SIZE = 10
const TITLE_MAX = 100
const CONTENT_MAX = 5000
const EXCERPT_MAX = 140

const inputClass =
  'w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 ease-spring placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15'

/** 목록 응답이 content 를 전부 담고 있어 상세를 따로 부르지 않고 여기서 잘라 쓴다. */
function toExcerpt(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX)}…` : flat
}

export function Community() {
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<PostPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
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
    getPosts({ page, size: PAGE_SIZE, instrumentId: filterInstrumentId })
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
  }, [page, reloadKey, filterInstrumentId])

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setFormError(null)
    try {
      await createPost({
        title: title.trim(),
        content: content.trim(),
        instrumentId: filterInstrumentId,
      })
      setTitle('')
      setContent('')
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
            <Button variant={formOpen ? 'ghost' : 'primary'} onClick={() => setFormOpen((v) => !v)}>
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
                  placeholder="매매 기록이나 궁금한 점을 남겨 보세요"
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              {/* gain(=상승 적색) 은 시세용 토큰이다. 폼 오류는 Signup·Field 와 같은 rose 를 쓴다 */}
              {formError && <p className="text-sm text-rose-300">{formError}</p>}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? '등록 중…' : '등록'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {!formOpen && (
          <>
            <section className="mt-8 space-y-4">
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
                        <p className="mt-4 text-xs text-muted">
                          <span className="text-ink/80">{post.authorNickname}</span>
                          <span className="px-2 text-muted/50">·</span>
                          <span className="tabular">{formatDateTime(post.createdAt)}</span>
                        </p>
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
