import { Array, pipe } from 'effect'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BlogList } from '@/components/BlogList'
import { JsonLd } from '@/components/JsonLd'
import { paginatePosts } from '@/lib/blog-pagination'
import { getAllPosts } from '@/lib/posts'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'BlogIndex' })

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: `https://withlily.app/${locale}/blog`,
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
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: ['/og-image.png'],
    },
    alternates: {
      canonical: `https://withlily.app/${locale}/blog`,
      languages: {
        en: 'https://withlily.app/en/blog',
        fr: 'https://withlily.app/fr/blog',
        'x-default': 'https://withlily.app/en/blog',
      },
    },
  }
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'BlogIndex' })
  const allPosts = getAllPosts(locale)
  const { items, page, totalPages } = paginatePosts(allPosts, 1)

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
    ],
  }

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: pipe(
      items,
      Array.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
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
          href={`/${locale}`}
          className="text-primary text-sm font-semibold mb-8 inline-block hover:text-primary-dark transition-colors"
        >
          {t('back')}
        </Link>
        <h1 className="text-5xl font-bold text-lily-text mt-4 mb-4">
          {t('heading')}
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto">{t('subheading')}</p>
      </header>

      <section className="max-w-6xl mx-auto px-6">
        {Array.match(allPosts, {
          onEmpty: () => (
            <p className="text-center text-muted py-24">{t('empty')}</p>
          ),
          onNonEmpty: () => (
            <BlogList
              locale={locale}
              pageItems={items}
              page={page}
              totalPages={totalPages}
            />
          ),
        })}
      </section>
    </main>
  )
}
