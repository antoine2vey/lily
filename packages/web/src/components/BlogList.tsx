'use client'

import { Array, Option, pipe } from 'effect'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BlogPostCard } from '@/components/BlogPostCard'
import { blogPath } from '@/lib/blog-pagination'
import type { PostMeta } from '@/lib/posts'

interface BlogListProps {
  locale: string
  pageItems: PostMeta[]
  page: number
  totalPages: number
}

const MAX_SEARCH_RESULTS = 50
const DEBOUNCE_MS = 150

export function BlogList({
  locale,
  pageItems,
  page,
  totalPages,
}: BlogListProps) {
  const t = useTranslations('BlogIndex')
  const [query, setQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')
  const [results, setResults] = useState<PostMeta[] | null>(null)
  const fuseRef = useRef<import('fuse.js').default<PostMeta> | null>(null)
  const indexLoadRef = useRef<Promise<void> | null>(null)
  const hasSyncedUrlRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = pipe(
      Option.fromNullable(new URLSearchParams(window.location.search).get('q')),
      Option.getOrElse(() => '')
    )
    if (q) {
      setQuery(q)
      setCommittedQuery(q)
    }
  }, [])

  const ensureIndex = useCallback(async () => {
    if (fuseRef.current) return
    if (!indexLoadRef.current) {
      indexLoadRef.current = (async () => {
        const [{ default: Fuse }, indexRes] = await Promise.all([
          import('fuse.js'),
          fetch(`/search-index-${locale}.json`),
        ])
        const entries = (await indexRes.json()) as PostMeta[]
        fuseRef.current = new Fuse(entries, {
          keys: [
            { name: 'title', weight: 0.5 },
            { name: 'description', weight: 0.2 },
            { name: 'tags', weight: 0.2 },
            { name: 'category', weight: 0.1 },
          ],
          threshold: 0.35,
          ignoreLocation: true,
          minMatchCharLength: 2,
        })
      })()
    }
    await indexLoadRef.current
  }, [locale])

  useEffect(() => {
    let cancelled = false
    if (!committedQuery.trim()) {
      setResults(null)
      return
    }
    ensureIndex().then(() => {
      if (cancelled || !fuseRef.current) return
      const hits = fuseRef.current.search(committedQuery, {
        limit: MAX_SEARCH_RESULTS,
      })
      setResults(
        pipe(
          hits,
          Array.map((h) => h.item)
        )
      )
    })
    return () => {
      cancelled = true
    }
  }, [committedQuery, ensureIndex])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommittedQuery(query)
      const params = new URLSearchParams(window.location.search)
      const hadQ = params.has('q')
      const trimmed = query.trim()
      if (!trimmed && !hadQ && !hasSyncedUrlRef.current) return
      hasSyncedUrlRef.current = true
      if (trimmed) params.set('q', query)
      else params.delete('q')
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}`
      )
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query])

  const inSearchMode = committedQuery.trim().length > 0
  const displayed = useMemo(
    () =>
      inSearchMode
        ? pipe(
            Option.fromNullable(results),
            Option.getOrElse(() => [] as PostMeta[])
          )
        : pageItems,
    [inSearchMode, results, pageItems]
  )

  return (
    <div>
      <div className="max-w-xl mx-auto mb-10 px-2">
        <label htmlFor="blog-search" className="sr-only">
          {t('searchAriaLabel')}
        </label>
        <div className="relative">
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchAriaLabel')}
            autoComplete="off"
            className="w-full shadow-neu-inset bg-background rounded-2xl px-5 py-3 text-lily-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('searchClear')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-lg px-2 py-1 rounded-full"
            >
              ×
            </button>
          )}
        </div>
        {inSearchMode && results !== null && (
          <p className="text-center text-muted text-sm mt-3" aria-live="polite">
            {t('searchResultsCount', { count: results.length })}
          </p>
        )}
      </div>

      {inSearchMode && results !== null && results.length === 0 ? (
        <p className="text-center text-muted py-16">{t('noResults')}</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.map(displayed, (post) => (
            <BlogPostCard key={post.slug} post={post} locale={locale} />
          ))}
        </div>
      )}

      {!inSearchMode && totalPages > 1 && (
        <Pagination locale={locale} page={page} totalPages={totalPages} />
      )}
    </div>
  )
}

interface PaginationProps {
  locale: string
  page: number
  totalPages: number
}

function Pagination({ locale, page, totalPages }: PaginationProps) {
  const t = useTranslations('BlogIndex')
  const pages = buildPageList(page, totalPages)
  return (
    <nav
      aria-label={t('paginationLabel')}
      className="mt-16 flex items-center justify-center gap-2 flex-wrap"
    >
      {page > 1 ? (
        <Link
          href={blogPath(locale, page - 1)}
          rel="prev"
          className="shadow-neu bg-background hover:shadow-neu-lg rounded-xl px-4 py-2 text-sm font-semibold text-lily-text transition-all"
        >
          {t('paginationPrevious')}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="shadow-neu-inset bg-background rounded-xl px-4 py-2 text-sm text-muted/60"
        >
          {t('paginationPrevious')}
        </span>
      )}

      <ol className="flex items-center gap-2">
        {Array.map(pages, (p, i) =>
          p === '…' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position within paginator
            <li key={`gap-${i}`} className="px-2 text-muted" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span
                  aria-current="page"
                  className="shadow-neu-inset bg-background rounded-xl px-4 py-2 text-sm font-bold text-primary"
                >
                  {p}
                </span>
              ) : (
                <Link
                  href={blogPath(locale, p)}
                  aria-label={t('paginationPageNumber', { page: p })}
                  className="shadow-neu bg-background hover:shadow-neu-lg rounded-xl px-4 py-2 text-sm font-semibold text-lily-text transition-all"
                >
                  {p}
                </Link>
              )}
            </li>
          )
        )}
      </ol>

      {page < totalPages ? (
        <Link
          href={blogPath(locale, page + 1)}
          rel="next"
          className="shadow-neu bg-background hover:shadow-neu-lg rounded-xl px-4 py-2 text-sm font-semibold text-lily-text transition-all"
        >
          {t('paginationNext')}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="shadow-neu-inset bg-background rounded-xl px-4 py-2 text-sm text-muted/60"
        >
          {t('paginationNext')}
        </span>
      )}
    </nav>
  )
}

function buildPageList(
  current: number,
  total: number
): ReadonlyArray<number | '…'> {
  if (total <= 7) return Array.range(1, total)
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  const items: Array<number | '…'> = [1]
  if (start > 2) items.push('…')
  items.push(...Array.range(start, end))
  if (end < total - 1) items.push('…')
  items.push(total)
  return items
}
