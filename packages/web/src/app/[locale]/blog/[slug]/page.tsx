import { Array, DateTime, Match, Option, pipe, String } from 'effect'
// HowTo schema removed: deprecated by Google in Sept 2023 for non-DIY content.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { AppDownloadButton } from '@/components/AppDownloadButton'
import { JsonLd } from '@/components/JsonLd'
import { ReadingProgressBar } from '@/components/ReadingProgressBar'
import { defaultAuthor } from '@/lib/authors'
import { getAllPosts, getPostBySlug } from '@/lib/posts'

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const locales = ['en', 'fr']
  return Array.flatMap(locales, (locale) =>
    Array.map(getAllPosts(locale), (post) => ({ locale, slug: post.slug }))
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const postOption = getPostBySlug(slug, locale)
  if (Option.isNone(postOption)) return {}
  const post = postOption.value

  const t = await getTranslations({ locale, namespace: 'BlogPost' })

  const ogImages = post.coverImage
    ? [{ url: post.coverImage, width: 1200, height: 630, alt: post.title }]
    : [{ url: '/og-image.png', width: 1200, height: 630, alt: post.title }]

  const otherLocale = locale === 'en' ? 'fr' : 'en'
  const otherPost = getPostBySlug(slug, otherLocale)
  const languages: Record<string, string> = {
    [locale]: `https://withlily.app/${locale}/blog/${slug}`,
    'x-default': `https://withlily.app/en/blog/${slug}`,
  }
  if (Option.isSome(otherPost)) {
    languages[otherLocale] = `https://withlily.app/${otherLocale}/blog/${slug}`
  }

  return {
    title: `${post.title} ${t('metaTitleSuffix')}`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://withlily.app/${locale}/blog/${slug}`,
      type: 'article',
      publishedTime: post.date,
      images: ogImages,
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: ogImages,
    },
    alternates: {
      canonical: `https://withlily.app/${locale}/blog/${slug}`,
      languages,
    },
  }
}

function formatDate(dateStr: string, locale: string) {
  return pipe(
    DateTime.make(dateStr),
    Option.match({
      onNone: () => dateStr,
      onSome: (dt) =>
        DateTime.format(dt, {
          locale: pipe(
            Match.value(locale),
            Match.when('fr', () => 'fr-FR' as const),
            Match.orElse(() => 'en-US' as const)
          ),
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
    })
  )
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const postOption = getPostBySlug(slug, locale)
  if (Option.isNone(postOption)) notFound()
  const post = postOption.value

  const t = await getTranslations({ locale, namespace: 'BlogPost' })

  const author = defaultAuthor

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: author.name,
      jobTitle: author.role,
      url: 'https://withlily.app',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Lily',
      logo: {
        '@type': 'ImageObject',
        url: 'https://withlily.app/apple-touch-icon.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://withlily.app/${locale}/blog/${slug}`,
    },
    image: post.coverImage
      ? pipe(post.coverImage, (img) =>
          pipe(img, String.startsWith('http'))
            ? img
            : `https://withlily.app${img}`
        )
      : 'https://withlily.app/og-image.png',
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('home'),
        item: `https://withlily.app/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('blog'),
        item: `https://withlily.app/${locale}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `https://withlily.app/${locale}/blog/${slug}`,
      },
    ],
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <ReadingProgressBar />
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="max-w-3xl mx-auto px-6 pt-16">
        <nav className="flex items-center gap-2 text-sm text-muted mb-10">
          <Link
            href={`/${locale}`}
            className="hover:text-primary transition-colors"
          >
            {t('home')}
          </Link>
          <span>›</span>
          <Link
            href={`/${locale}/blog`}
            className="hover:text-primary transition-colors"
          >
            {t('blog')}
          </Link>
          <span>›</span>
          <span className="text-lily-text truncate">{post.title}</span>
        </nav>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs font-semibold text-primary bg-primary-tint px-3 py-1 rounded-full capitalize">
            {pipe(post.category, String.replace('-', ' '))}
          </span>
          <span className="text-xs text-muted">
            {t('minRead', { minutes: post.readingTimeMinutes })}
          </span>
          <time dateTime={post.date} className="text-xs text-muted">
            {formatDate(post.date, locale)}
          </time>
          <span className="text-xs text-muted">
            {t('by')} {author.name}
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-lily-text mb-6 leading-tight">
          {post.title}
        </h1>
        <p className="text-xl text-muted mb-10 leading-relaxed">
          {post.description}
        </p>

        {post.coverImage && (
          <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mb-12 shadow-neu">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        <div className="prose prose-lg max-w-none text-lily-text [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-lily-text [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-lily-text [&_h3]:mt-8 [&_h3]:mb-3 [&_p]:text-muted [&_p]:leading-relaxed [&_p]:mb-5 [&_ul]:text-muted [&_ul]:space-y-2 [&_ul]:mb-5 [&_ol]:text-muted [&_ol]:space-y-2 [&_ol]:mb-5 [&_li]:leading-relaxed [&_strong]:text-lily-text [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary-dark [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_blockquote]:italic [&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_thead]:border-b-2 [&_thead]:border-primary [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:font-semibold [&_th]:text-lily-text [&_td]:py-2 [&_td]:px-3 [&_td]:text-muted [&_tr]:border-b [&_tr]:border-primary-tint [&_tbody_tr:last-child]:border-0">
          <MDXRemote
            source={post.content}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        </div>

        <div className="mt-16 p-8 shadow-neu rounded-2xl bg-background text-center">
          <p className="text-2xl font-bold text-lily-text mb-3">
            {t('ctaHeading')}
          </p>
          <p className="text-muted mb-6">{t('ctaText')}</p>
          <AppDownloadButton
            label={t('ctaButton')}
            className="inline-block bg-primary hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-full transition-colors"
          />
        </div>

        <div className="mt-12 text-center">
          <Link
            href={`/${locale}/blog`}
            className="text-primary font-semibold hover:text-primary-dark transition-colors"
          >
            {t('backLink')}
          </Link>
        </div>
      </article>
    </main>
  )
}
