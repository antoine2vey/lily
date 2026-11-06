import { Link } from '@tanstack/react-router'
import { Array, Option, pipe } from 'effect'
import type Fuse from 'fuse.js'
import { useEffect, useRef, useState } from 'react'
import { fmt, plural, useI18n } from '@/i18n'
import type { PaginatedPosts } from '@/lib/blog-pagination'
import { postIndex } from '@/lib/post-data'
import type { PostMeta } from '@/lib/posts'
import { PostCard } from './PostCard'

const MAX_RESULTS = 50
const DEBOUNCE_MS = 150

const readQuery = (): string =>
  Option.getOrElse(
    Option.fromNullishOr(new URLSearchParams(window.location.search).get('q')),
    () => ''
  )

const writeQuery = (q: string) => {
  const params = new URLSearchParams(window.location.search)
  if (q.trim()) params.set('q', q)
  else params.delete('q')
  const qs = params.toString()
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}`
  )
}

// The full index (titles, descriptions, tags) is a lazy chunk, fetched on the first keystroke only.
function useSearch() {
  const { locale } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ReadonlyArray<PostMeta> | null>(null)
  const fuse = useRef<Promise<Fuse<PostMeta>> | null>(null)

  useEffect(() => setQuery(readQuery()), [])

  useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      if (query !== readQuery()) writeQuery(query)
      if (!query.trim()) return setResults(null)
      fuse.current ??= Promise.all([import('fuse.js'), postIndex(locale)]).then(
        ([{ default: F }, posts]) =>
          new F(posts, {
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
      )
      const hits = (await fuse.current).search(query, { limit: MAX_RESULTS })
      if (!cancelled) setResults(Array.map(hits, (h) => h.item))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query, locale])

  return { query, setQuery, results }
}

export function BlogList({ page }: { page: PaginatedPosts }) {
  const { locale, m } = useI18n()
  const t = m.BlogIndex
  const { query, setQuery, results } = useSearch()
  const searching = results !== null
  const shown = results ?? page.items

  return (
    <div>
      <div className="mx-auto mb-12 max-w-xl">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchAriaLabel}
            autoComplete="off"
            className="w-full rounded-full bg-surface px-6 py-3.5 text-ink ring-1 ring-line placeholder:text-muted focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.searchClear}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-2 py-1 text-lg text-muted hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
        {searching && (
          <p className="mt-3 text-center text-sm text-muted" aria-live="polite">
            {fmt(plural(locale, results.length, t.searchResultsCount), {
              count: results.length,
            })}
          </p>
        )}
      </div>
      {searching && results.length === 0 ? (
        <p className="py-16 text-center text-muted">{t.noResults}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.map(shown, (post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
      {!searching && page.totalPages > 1 && (
        <Pagination current={page.page} total={page.totalPages} />
      )}
    </div>
  )
}

const pageList = (
  current: number,
  total: number
): ReadonlyArray<number | 'gap'> => {
  if (total <= 7) return Array.range(1, total)
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  return [
    1,
    ...(start > 2 ? ['gap' as const] : []),
    ...Array.range(start, end),
    ...(end < total - 1 ? ['gap' as const] : []),
    total,
  ]
}

function PageLink({
  page,
  children,
  ...rest
}: {
  page: number
  children: React.ReactNode
  rel?: string
  'aria-label'?: string
  className: string
}) {
  const { locale } = useI18n()
  return page <= 1 ? (
    <Link to="/$locale/blog" params={{ locale }} {...rest}>
      {children}
    </Link>
  ) : (
    <Link
      to="/$locale/blog/page/$page"
      params={{ locale, page: String(page) }}
      {...rest}
    >
      {children}
    </Link>
  )
}

function Pagination({ current, total }: { current: number; total: number }) {
  const t = useI18n().m.BlogIndex
  const chip = 'rounded-full px-4 py-2 text-sm font-semibold'
  const idle = `${chip} bg-surface text-ink ring-1 ring-line transition-colors hover:bg-chip`
  const off = `${chip} text-muted/60`
  return (
    <nav
      aria-label={t.paginationLabel}
      className="mt-16 flex flex-wrap items-center justify-center gap-2"
    >
      {current > 1 ? (
        <PageLink page={current - 1} rel="prev" className={idle}>
          {t.paginationPrevious}
        </PageLink>
      ) : (
        <span aria-disabled="true" className={off}>
          {t.paginationPrevious}
        </span>
      )}
      <ol className="flex items-center gap-2">
        {pipe(
          pageList(current, total),
          Array.map((p, i) =>
            p === 'gap' ? (
              <li
                key={`gap-${i < 2 ? 'a' : 'b'}`}
                className="px-1 text-muted"
                aria-hidden="true"
              >
                …
              </li>
            ) : (
              <li key={p}>
                {p === current ? (
                  <span
                    aria-current="page"
                    className={`${chip} bg-ink text-bg`}
                  >
                    {p}
                  </span>
                ) : (
                  <PageLink
                    page={p}
                    aria-label={fmt(t.paginationPageNumber, { page: p })}
                    className={idle}
                  >
                    {p}
                  </PageLink>
                )}
              </li>
            )
          )
        )}
      </ol>
      {current < total ? (
        <PageLink page={current + 1} rel="next" className={idle}>
          {t.paginationNext}
        </PageLink>
      ) : (
        <span aria-disabled="true" className={off}>
          {t.paginationNext}
        </span>
      )}
    </nav>
  )
}
