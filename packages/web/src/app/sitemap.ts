import { Array, DateTime, Option, pipe } from 'effect'
import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales
  const staticPages = ['', '/blog', '/privacy', '/terms']

  const staticUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(staticPages, (pagePath) => ({
      url: `https://withlily.app/${locale}${pagePath}`,
      lastModified: DateTime.formatIso(DateTime.unsafeNow()),
    }))
  )

  const postUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(getAllPosts(locale), (post) => ({
      url: `https://withlily.app/${locale}/blog/${post.slug}`,
      lastModified: pipe(
        DateTime.make(post.date),
        Option.map(DateTime.formatIso),
        Option.getOrElse(() => DateTime.formatIso(DateTime.unsafeNow()))
      ),
    }))
  )

  return Array.appendAll(staticUrls, postUrls)
}
