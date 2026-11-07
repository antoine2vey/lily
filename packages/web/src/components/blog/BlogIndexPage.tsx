import { Array } from 'effect'
import { fmt, type Locale, messagesFor, useI18n } from '@/i18n'
import {
  blogPath,
  type PaginatedPosts,
  POSTS_PER_PAGE,
} from '@/lib/blog-pagination'
import { breadcrumbs, localeUrl, seo } from '@/lib/seo'
import { BlogList } from './BlogList'

export const blogIndexHead = (
  locale: Locale,
  { items, page, totalPages }: PaginatedPosts
) => {
  const t = messagesFor(locale).BlogIndex
  const path = blogPath(page)
  const offset = (page - 1) * POSTS_PER_PAGE
  const crumbs: Array<readonly [string, string]> = [
    ['Lily', ''],
    [t.heading, '/blog'],
  ]
  if (page > 1)
    crumbs.push([fmt(t.paginationPage, { page, total: totalPages }), path])
  const title =
    page > 1 ? `${t.metaTitle} ${fmt(t.pageSuffix, { page })}` : t.metaTitle
  return seo({
    locale,
    path,
    title,
    description:
      page > 1
        ? fmt(t.metaDescriptionPage, { page, total: totalPages })
        : t.metaDescription,
    imageAlt: `Lily — ${t.heading}`,
    robots: page > 1 ? 'index, follow' : undefined,
    jsonLd: [
      breadcrumbs(locale, crumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: Array.map(items, (post, i) => ({
          '@type': 'ListItem',
          position: offset + i + 1,
          url: localeUrl(locale, `/blog/${post.slug}`),
          name: post.title,
        })),
      },
    ],
  })
}

export function BlogIndexPage({ page }: { page: PaginatedPosts }) {
  const t = useI18n().m.BlogIndex
  return (
    <main className="px-5 pt-32 pb-24">
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-ink md:text-6xl">
          {t.heading}
        </h1>
        {page.page > 1 && (
          <p className="mb-3 text-sm text-muted">
            {fmt(t.paginationPage, { page: page.page, total: page.totalPages })}
          </p>
        )}
        <p className="text-lg text-ink-2">{t.subheading}</p>
      </header>
      <section className="mx-auto max-w-6xl">
        {page.items.length === 0 ? (
          <p className="py-24 text-center text-muted">{t.empty}</p>
        ) : (
          <BlogList page={page} />
        )}
      </section>
    </main>
  )
}
