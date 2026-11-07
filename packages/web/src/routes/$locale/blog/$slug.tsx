import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Array } from 'effect'
import { ReadingProgress } from '@/components/blog/ReadingProgress'
import { StoreButtons } from '@/components/site/StoreButtons'
import { fmt, type Locale, locales, messagesFor, useI18n } from '@/i18n'
import { author, authorRef } from '@/lib/authors'
import { formatPostDate } from '@/lib/blog'
import type { PostMeta } from '@/lib/posts'
import { breadcrumbs, localeUrl, seo } from '@/lib/seo'
import { OG_IMAGE, ORIGIN } from '@/lib/site'

const article = (locale: Locale, post: PostMeta) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.title,
  description: post.description,
  datePublished: post.date,
  dateModified: post.updated ?? post.date,
  author: authorRef(locale),
  publisher: {
    '@type': 'Organization',
    name: 'Lily',
    logo: { '@type': 'ImageObject', url: `${ORIGIN}/apple-touch-icon.png` },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': localeUrl(locale, `/blog/${post.slug}`),
  },
  image: post.coverImage ? new URL(post.coverImage, ORIGIN).href : OG_IMAGE.url,
})

export const Route = createFileRoute('/$locale/blog/$slug')({
  loader: async ({ params }) => {
    const { hasPost, loadPost } = await import('@/lib/post-data')
    const post = await loadPost(params.locale, params.slug)
    if (!post) throw notFound()
    return {
      ...post,
      alternates: Array.filter(locales, (l) => hasPost(l, params.slug)),
    }
  },
  head: ({ params: { locale, slug }, loaderData }) => {
    if (!loaderData) return {}
    const { meta, alternates } = loaderData
    const t = messagesFor(locale).BlogPost
    const path = `/blog/${slug}`
    return seo({
      locale,
      path,
      title: `${meta.title} ${t.metaTitleSuffix}`,
      ogTitle: meta.title,
      description: meta.description,
      type: 'article',
      publishedTime: meta.date,
      modifiedTime: meta.updated,
      image: meta.coverImage,
      imageAlt: meta.title,
      alternates,
      jsonLd: [
        article(locale, meta),
        breadcrumbs(locale, [
          [t.home, ''],
          [t.blog, '/blog'],
          [meta.title, path],
        ]),
      ],
    })
  },
  component: PostPage,
})

function PostPage() {
  const { meta, html } = Route.useLoaderData()
  const { locale, m } = useI18n()
  const t = m.BlogPost
  return (
    <main className="px-5 pt-28 pb-24">
      <ReadingProgress />
      <article className="mx-auto max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-10 flex items-center gap-2 text-sm text-muted"
        >
          <Link to="/$locale" params={{ locale }} className="hover:text-ink">
            {t.home}
          </Link>
          <span aria-hidden="true">›</span>
          <Link
            to="/$locale/blog"
            params={{ locale }}
            className="hover:text-ink"
          >
            {t.blog}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="truncate text-ink-2">{meta.title}</span>
        </nav>
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
          <span className="rounded-full bg-tint px-3 py-1 font-semibold text-primary-dark dark:bg-chip dark:text-primary">
            {m.Category[meta.category]}
          </span>
          <span>{fmt(t.minRead, { minutes: meta.readingTime })}</span>
          <time dateTime={meta.date}>
            {formatPostDate(locale, meta.date, 'long')}
          </time>
          {meta.updated && meta.updated !== meta.date && (
            <span>
              {t.updated}{' '}
              <time dateTime={meta.updated}>
                {formatPostDate(locale, meta.updated, 'long')}
              </time>
            </span>
          )}
          <span>
            {t.by}{' '}
            <Link
              to="/$locale/team"
              params={{ locale }}
              rel="author"
              className="font-semibold text-ink-2 hover:text-ink hover:underline"
            >
              {author.name}
            </Link>
          </span>
        </div>
        <h1 className="mb-12 text-4xl leading-tight font-bold tracking-tight text-ink md:text-5xl">
          {meta.title}
        </h1>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: build-time markdown from our own content/posts */}
        <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
        <aside className="mt-16 rounded-3xl bg-tint p-8 text-center dark:bg-surface">
          <p className="mb-3 text-2xl font-bold text-ink">{t.ctaHeading}</p>
          <p className="mx-auto mb-6 max-w-md text-ink-2">{t.ctaText}</p>
          <div className="flex justify-center">
            <StoreButtons />
          </div>
        </aside>
        <div className="mt-12 text-center">
          <Link
            to="/$locale/blog"
            params={{ locale }}
            className="font-semibold text-primary-dark hover:underline dark:text-primary"
          >
            {t.backLink}
          </Link>
        </div>
      </article>
    </main>
  )
}
