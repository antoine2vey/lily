import { Array, DateTime, Match, Option, pipe } from 'effect'
import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales
  const staticPages = ['', '/blog', '/privacy', '/terms']

  const staticUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(staticPages, (pagePath) => ({
      url: `https://lilyapp.io/${locale}${pagePath}`,
      lastModified: DateTime.formatIso(DateTime.unsafeNow()),
      changeFrequency: pipe(
        Match.value(pagePath),
        Match.when('', () => 'weekly' as const),
        Match.when('/blog', () => 'weekly' as const),
        Match.orElse(() => 'yearly' as const)
      ),
      priority: pipe(
        Match.value(pagePath),
        Match.when('', () => 1),
        Match.when('/blog', () => 0.8),
        Match.orElse(() => 0.3)
      ),
    }))
  )

  const postUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(getAllPosts(locale), (post) => ({
      url: `https://lilyapp.io/${locale}/blog/${post.slug}`,
      lastModified: pipe(
        DateTime.make(post.date),
        Option.map(DateTime.formatIso),
        Option.getOrElse(() => DateTime.formatIso(DateTime.unsafeNow()))
      ),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  )

  return Array.appendAll(staticUrls, postUrls)
}
