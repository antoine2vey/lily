import { Array, pipe } from 'effect'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { BlogPostCard } from '@/components/BlogPostCard'
import { getAllPosts } from '@/lib/posts'

export async function LatestPosts() {
  const locale = await getLocale()
  const posts = pipe(getAllPosts(locale), Array.take(3))
  if (Array.isEmptyArray(posts)) return null

  const t = await getTranslations('LatestPosts')

  return (
    <section className="py-24 bg-background">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-primary font-semibold text-sm mb-2 uppercase tracking-wide">
              {t('eyebrow')}
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-lily-text">
              {t('heading')}
            </h2>
          </div>
          <Link
            href={`/${locale}/blog`}
            className="hidden sm:inline-flex items-center gap-1 text-primary font-semibold hover:text-primary-dark transition-colors shrink-0"
          >
            {t('viewAll')}
          </Link>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.map(posts, (post) => (
            <BlogPostCard key={post.slug} post={post} locale={locale} />
          ))}
        </div>

        <div className="mt-10 text-center sm:hidden">
          <Link
            href={`/${locale}/blog`}
            className="inline-flex items-center gap-1 text-primary font-semibold hover:text-primary-dark transition-colors"
          >
            {t('viewAllMobile')}
          </Link>
        </div>
      </div>
    </section>
  )
}
