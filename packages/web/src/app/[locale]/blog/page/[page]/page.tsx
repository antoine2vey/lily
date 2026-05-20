import { Array, pipe } from 'effect'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BlogList } from '@/components/BlogList'
import { JsonLd } from '@/components/JsonLd'
import { routing } from '@/i18n/routing'
import {
  POSTS_PER_PAGE,
  paginatePosts,
  totalPages as totalPagesFn,
} from '@/lib/blog-pagination'
import { getAllPosts } from '@/lib/posts'

interface Props {
  params: Promise<{ locale: string; page: string }>
}

export function generateStaticParams() {
  return pipe(
    routing.locales as ReadonlyArray<string>,
    Array.flatMap((locale) => {
      const total = totalPagesFn(getAllPosts(locale))
      if (total < 2) return [] as Array<{ locale: string; page: string }>
      return pipe(
        Array.range(2, total),
        Array.map((page) => ({ locale, page: String(page) }))
      )
    })
  )
}

function parsePage(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 2 ? n : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page: pageStr } = await params
  const page = parsePage(pageStr)
  if (page === null) return {}

  const t = await getTranslations({ locale, namespace: 'BlogIndex' })
  const total = totalPagesFn(getAllPosts(locale))
  if (page > total) return {}

  const title = `${t('metaTitle')} ${t('pageSuffix', { page })}`
  const url = `https://withlily.app/${locale}/blog/page/${page}`

  const otherLocale = locale === 'fr' ? 'en' : 'fr'
  const otherTotal = totalPagesFn(getAllPosts(otherLocale))
  const otherUrl =
    page <= otherTotal
      ? `https://withlily.app/${otherLocale}/blog/page/${page}`
      : `https://withlily.app/${otherLocale}/blog`
  const enTotal = locale === 'en' ? total : otherTotal

  return {
    title,
    description: t('metaDescription'),
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: t('metaDescription'),
      url,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Plant Care Blog',
        },
      ],
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: t('metaDescription'),
      images: ['/og-image.png'],
    },
    alternates: {
      canonical: url,
      languages: {
        [locale]: url,
        [otherLocale]: otherUrl,
        'x-default':
          page <= enTotal
            ? `https://withlily.app/en/blog/page/${page}`
            : 'https://withlily.app/en/blog',
      },
    },
  }
}

export default async function PaginatedBlogPage({ params }: Props) {
  const { locale, page: pageStr } = await params
  const page = parsePage(pageStr)
  if (page === null) notFound()

  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'BlogIndex' })
  const allPosts = getAllPosts(locale)
  const total = totalPagesFn(allPosts)
  if (page > total) notFound()

  const { items, page: safePage, totalPages } = paginatePosts(allPosts, page)
  const pageLabel = t('pageSuffix', { page: safePage })

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('back'),
        item: `https://withlily.app/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('heading'),
        item: `https://withlily.app/${locale}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: pageLabel,
        item: `https://withlily.app/${locale}/blog/page/${safePage}`,
      },
    ],
  }

  const offset = (safePage - 1) * POSTS_PER_PAGE
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: pipe(
      items,
      Array.map((post, index) => ({
        '@type': 'ListItem',
        position: offset + index + 1,
        url: `https://withlily.app/${locale}/blog/${post.slug}`,
        name: post.title,
      }))
    ),
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={itemListSchema} />
      <header className="py-16 px-6 text-center">
        <Link
          href={`/${locale}/blog`}
          className="text-primary text-sm font-semibold mb-8 inline-block hover:text-primary-dark transition-colors"
        >
          {t('back')}
        </Link>
        <h1 className="text-5xl font-bold text-lily-text mt-4 mb-2">
          {t('heading')}
        </h1>
        <p className="text-sm text-muted/80 mb-3">{pageLabel}</p>
        <p className="text-lg text-muted max-w-xl mx-auto">{t('subheading')}</p>
      </header>

      <section className="max-w-6xl mx-auto px-6">
        <BlogList
          locale={locale}
          pageItems={items}
          page={safePage}
          totalPages={totalPages}
        />
      </section>
    </main>
  )
}
