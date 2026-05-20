import { Array, pipe } from 'effect'
import type { PostMeta } from '@/lib/posts'

export const POSTS_PER_PAGE = 12

export interface PaginatedPosts {
  items: PostMeta[]
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
}

export function totalPages(posts: ReadonlyArray<PostMeta>): number {
  return Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE))
}

export function paginatePosts(
  posts: ReadonlyArray<PostMeta>,
  page: number
): PaginatedPosts {
  const total = totalPages(posts)
  const safePage = Math.min(Math.max(1, page), total)
  const items = pipe(
    posts as PostMeta[],
    Array.drop((safePage - 1) * POSTS_PER_PAGE),
    Array.take(POSTS_PER_PAGE)
  )
  return {
    items,
    page: safePage,
    totalPages: total,
    hasPrev: safePage > 1,
    hasNext: safePage < total,
  }
}

export function blogPath(locale: string, page: number): string {
  return page <= 1 ? `/${locale}/blog` : `/${locale}/blog/page/${page}`
}
