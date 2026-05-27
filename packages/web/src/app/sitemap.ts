import { Array, DateTime, Option, pipe } from 'effect'
import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { totalPages } from '@/lib/blog-pagination'
import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = routing.locales
  const staticPages = ['', '/about', '/blog', '/privacy', '/terms', '/support']

  const buildLanguageAlternates = (pagePath: string): Record<string, string> =>
    pipe(
      locales,
      Array.reduce({} as Record<string, string>, (acc, l) => ({
        ...acc,
        [l]: `https://withlily.app/${l}${pagePath}`,
      })),
      (langs) => ({
        ...langs,
        'x-default': `https://withlily.app/en${pagePath}`,
      })
    )

  const staticUrls: MetadataRoute.Sitemap = Array.flatMap(locales, (locale) =>
    Array.map(staticPages, (pagePath) => ({
      url: `https://withlily.app/${locale}${pagePath}`,
      alternates: { languages: buildLanguageAlternates(pagePath) },
    }))
  )

  const postsByLocale = Array.map(locales, (locale) => ({
    locale,
    posts: getAllPosts(locale),
  }))

  const allSlugs = pipe(
    postsByLocale,
    Array.flatMap(({ posts }) => Array.map(posts, (p) => p.slug))
  )

  const postUrls: MetadataRoute.Sitemap = Array.flatMap(
    postsByLocale,
    ({ locale, posts }) =>
      Array.map(posts, (post) => {
        const path = `/blog/${post.slug}`
        const languages = pipe(
          locales,
          Array.reduce({} as Record<string, string>, (acc, l) =>
            Array.contains(allSlugs, post.slug)
              ? { ...acc, [l]: `https://withlily.app/${l}${path}` }
              : acc
          ),
          (langs) => ({
            ...langs,
            'x-default': `https://withlily.app/en${path}`,
          })
        )
        return {
          url: `https://withlily.app/${locale}${path}`,
          lastModified: pipe(
            DateTime.make(post.date),
            Option.map(DateTime.formatIso),
            Option.getOrElse(() => DateTime.formatIso(DateTime.unsafeNow()))
          ),
          alternates: { languages },
        }
      })
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
          alternates: {
            languages: buildLanguageAlternates(`/blog/page/${page}`),
          },
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
