import { Array, pipe } from 'effect'
import type { PostMeta } from '@/lib/posts'

export const POSTS_PER_PAGE = 12

export interface PaginatedPosts {
  readonly items: ReadonlyArray<PostMeta>
  readonly page: number
  readonly totalPages: number
}

export const totalPages = (posts: ReadonlyArray<PostMeta>): number =>
  Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE))

export const paginatePosts = (
  posts: ReadonlyArray<PostMeta>,
  page: number
): PaginatedPosts => ({
  items: pipe(
    posts,
    Array.drop((page - 1) * POSTS_PER_PAGE),
    Array.take(POSTS_PER_PAGE)
  ),
  page,
  totalPages: totalPages(posts),
})

export const blogPath = (page: number): string =>
  page <= 1 ? '/blog' : `/blog/page/${page}`
