import { Array } from 'effect'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BlogPostCard } from '@/components/BlogPostCard'
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
      },
    },
  }
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'BlogIndex' })
  const posts = getAllPosts(locale)

  return (
    <main className="min-h-screen bg-background pb-24">
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
        {Array.match(posts, {
          onEmpty: () => (
            <p className="text-center text-muted py-24">{t('empty')}</p>
          ),
          onNonEmpty: (ps) => (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {Array.map(ps, (post) => (
                <BlogPostCard key={post.slug} post={post} locale={locale} />
              ))}
            </div>
          ),
        })}
      </section>
    </main>
  )
}
