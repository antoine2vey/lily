import { Array, DateTime, Option, pipe } from 'effect'
import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { totalPages } from '@/lib/blog-pagination'
import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales
  const staticPages = ['', '/about', '/blog', '/privacy', '/terms']

  const staticUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(staticPages, (pagePath) => ({
      url: `https://withlily.app/${locale}${pagePath}`,
    }))
  )

  const postsByLocale = Array.map(locales, (locale) => ({
    locale,
    posts: getAllPosts(locale),
  }))

  const postUrls: MetadataRoute.Sitemap = Array.flatMap(
    postsByLocale,
    ({ locale, posts }) =>
      Array.map(posts, (post) => ({
        url: `https://withlily.app/${locale}/blog/${post.slug}`,
        lastModified: pipe(
          DateTime.make(post.date),
          Option.map(DateTime.formatIso),
          Option.getOrElse(() => DateTime.formatIso(DateTime.unsafeNow()))
        ),
      }))
  )

  const paginatedUrls: MetadataRoute.Sitemap = Array.flatMap(
    postsByLocale,
    ({ locale, posts }) => {
      const total = totalPages(posts)
      if (total < 2) return [] as MetadataRoute.Sitemap
      return pipe(
        Array.range(2, total),
        Array.map((page) => ({
          url: `https://withlily.app/${locale}/blog/page/${page}`,
        }))
      )
    }
  )

  return pipe(
    staticUrls,
    Array.appendAll(postUrls),
    Array.appendAll(paginatedUrls)
  )
}
