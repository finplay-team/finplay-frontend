// 커뮤니티 게시글·댓글 CRUD 서비스 (authorId 가 없어 소유 판정은 닉네임 비교 + 403 이 최종 권위다)
import { api } from '../lib/apiClient'
import type {
  Comment,
  CommentCreateRequest,
  Post,
  PostCreateRequest,
  PostPage,
  PostUpdateRequest,
} from './types'

/**
 * page 는 0부터, size 는 1..50.
 * instrumentId 는 조회 조건일 뿐이라 **존재하지 않는 값을 넣어도 400 이 아니라 빈 content** 다 —
 * 생성·수정 시의 태그 유효성 검증과 의도적으로 다르다.
 */
export function getPosts(p?: {
  page?: number
  size?: number
  instrumentId?: number | null
}): Promise<PostPage> {
  const page = Math.max(0, p?.page ?? 0)
  const size = Math.min(50, Math.max(1, p?.size ?? 20))
  return api.get<PostPage>('/community/posts', {
    query: { page, size, instrumentId: p?.instrumentId ?? undefined },
  })
}

/** instrumentId 는 선택. 존재하지 않거나 tradable=false 인 종목은 둘 다 400 VALIDATION_ERROR 다(코드가 같아 구분 불가). */
export function createPost(req: PostCreateRequest): Promise<Post> {
  return api.post<Post>('/community/posts', req)
}

export function getPost(postId: number): Promise<Post> {
  return api.get<Post>(`/community/posts/${postId}`)
}

/**
 * PATCH 는 부분 수정이 아니라 전체 교체 — title·content 를 모두 보내야 한다.
 *
 * **instrumentId 를 빠뜨리면 서버가 기존 태그를 해제한다.** 그래서 호출부가 실수하지 않도록
 * 이 함수는 항상 키를 실어 보낸다(유지하려면 기존 값을, 해제하려면 명시적 null 을 넘긴다).
 */
export function updatePost(postId: number, req: PostUpdateRequest): Promise<Post> {
  return api.patch<Post>(`/community/posts/${postId}`, {
    title: req.title,
    content: req.content,
    instrumentId: req.instrumentId ?? null,
  })
}

export function deletePost(postId: number): Promise<void> {
  return api.del<void>(`/community/posts/${postId}`)
}

/**
 * bare array, 페이지네이션이 없어 전부 렌더한다.
 * 최상위에는 부모 댓글만 오고 대댓글은 각 부모의 replies 에 중첩돼 있다 —
 * 총 댓글 수를 세려면 replies 까지 더해야 한다(length 만 쓰면 과소 집계된다).
 */
export function getComments(postId: number): Promise<Comment[]> {
  return api.get<Comment[]>(`/community/posts/${postId}/comments`)
}

/**
 * parentCommentId 를 주면 대댓글이 된다. 중첩은 1단계뿐이라 대댓글에 답글을 달면 400 이고,
 * 부모가 없거나 다른 게시물 소속이면 404 다 — 이 404 는 게시물이 사라진 것이 아니다.
 */
export function createComment(postId: number, req: CommentCreateRequest): Promise<Comment> {
  return api.post<Comment>(`/community/posts/${postId}/comments`, {
    content: req.content,
    parentCommentId: req.parentCommentId ?? undefined,
  })
}

/** 삭제는 post 하위 경로가 아니라 /community/comments/{id} 다. 부모를 지우면 자식 대댓글도 함께 삭제된다. */
export function deleteComment(commentId: number): Promise<void> {
  return api.del<void>(`/community/comments/${commentId}`)
}

/** 부모 + 대댓글을 합한 총 댓글 수. 화면의 "댓글 N" 표기가 과소 집계되지 않게 한다. */
export function countComments(comments: Comment[]): number {
  return comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)
}
