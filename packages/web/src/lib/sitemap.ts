import { Array, DateTime, Option, pipe } from 'effect'
import { defaultLocale, type Locale, locales } from '../i18n'
import { blogPath, totalPages } from './blog-pagination'
import type { PostMeta } from './posts'
import { localeUrl } from './seo'

export const STATIC_PATHS = [
  '',
  '/about',
  '/blog',
  '/privacy',
  '/terms',
  '/support',
] as const

export interface SiteUrl {
  readonly locale: Locale
  readonly path: string
  readonly lastmod?: string
}

export const siteUrls = (
  index: (locale: Locale) => ReadonlyArray<PostMeta>
): ReadonlyArray<SiteUrl> => [
  ...Array.flatMap(locales, (locale) =>
    Array.map(STATIC_PATHS, (path) => ({ locale, path }))
  ),
  ...Array.flatMap(locales, (locale) =>
    Array.map(index(locale), (post) => ({
      locale,
      path: `/blog/${post.slug}`,
      lastmod: pipe(
        DateTime.make(post.date),
        Option.map(DateTime.formatIso),
        Option.getOrUndefined
      ),
    }))
  ),
  ...Array.flatMap(locales, (locale) =>
    pipe(
      totalPages(index(locale)),
      (total) => (total < 2 ? [] : Array.range(2, total)),
      Array.map((page) => ({ locale, path: blogPath(page) }))
    )
  ),
]

const alternates = (path: string): string =>
  [
    ...Array.map(locales, (l) => [l, localeUrl(l, path)] as const),
    ['x-default', localeUrl(defaultLocale, path)] as const,
  ]
    .map(
      ([lang, href]) =>
        `<xhtml:link rel="alternate" hreflang="${lang}" href="${href}" />`
    )
    .join('\n')

export const sitemapXml = (urls: ReadonlyArray<SiteUrl>): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...Array.map(urls, ({ locale, path, lastmod }) =>
      [
        '<url>',
        `<loc>${localeUrl(locale, path)}</loc>`,
        alternates(path),
        ...(lastmod ? [`<lastmod>${lastmod}</lastmod>`] : []),
        '</url>',
      ].join('\n')
    ),
    '</urlset>',
  ].join('\n')

export const ROBOTS_TXT = [
  ...Array.map(
    ['*', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'],
    (ua) => `User-Agent: ${ua}\nAllow: /\n`
  ),
  ...Array.map(
    ['CCBot', 'anthropic-ai', 'cohere-ai'],
    (ua) => `User-Agent: ${ua}\nDisallow: /\n`
  ),
  'User-Agent: Google-Extended\nAllow: /\n',
  'Sitemap: https://withlily.app/sitemap.xml\n',
].join('\n')
