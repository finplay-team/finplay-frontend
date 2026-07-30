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

/** page 는 0부터, size 는 1..50 */
export function getPosts(p?: { page?: number; size?: number }): Promise<PostPage> {
  const page = Math.max(0, p?.page ?? 0)
  const size = Math.min(50, Math.max(1, p?.size ?? 20))
  return api.get<PostPage>('/community/posts', { query: { page, size } })
}

export function createPost(req: PostCreateRequest): Promise<Post> {
  return api.post<Post>('/community/posts', req)
}

export function getPost(postId: number): Promise<Post> {
  return api.get<Post>(`/community/posts/${postId}`)
}

/** PATCH 는 부분 수정이 아니라 전체 교체 — title·content 를 모두 보내야 한다. */
export function updatePost(postId: number, req: PostUpdateRequest): Promise<Post> {
  return api.patch<Post>(`/community/posts/${postId}`, req)
}

export function deletePost(postId: number): Promise<void> {
  return api.del<void>(`/community/posts/${postId}`)
}

/** bare array, 페이지네이션이 없어 전부 렌더한다. */
export function getComments(postId: number): Promise<Comment[]> {
  return api.get<Comment[]>(`/community/posts/${postId}/comments`)
}

export function createComment(postId: number, req: CommentCreateRequest): Promise<Comment> {
  return api.post<Comment>(`/community/posts/${postId}/comments`, req)
}

/** 삭제는 post 하위 경로가 아니라 /community/comments/{id} 다. */
export function deleteComment(commentId: number): Promise<void> {
  return api.del<void>(`/community/comments/${commentId}`)
}
