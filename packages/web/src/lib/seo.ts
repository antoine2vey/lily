import { Array } from 'effect'
import type { JSX } from 'react'
import { defaultLocale, type Locale, locales } from '../i18n'
import { APP_STORE_ID, OG_IMAGE, ORIGIN } from './site'

export const localeUrl = (locale: Locale, path = ''): string =>
  `${ORIGIN}/${locale}${path}`

// react-router types head().meta as <meta> props only, yet HeadContent renders and escapes router-core's `script:ld+json` entry (headContentUtils.js).
export const jsonLd = (data: object) =>
  ({ 'script:ld+json': data }) as unknown as JSX.IntrinsicElements['meta']

export interface SeoInput {
  readonly locale: Locale
  readonly path: string
  readonly title: string
  readonly description: string
  readonly type?: 'website' | 'article' | undefined
  readonly image?: string | undefined
  readonly imageAlt: string
  readonly ogTitle?: string | undefined
  readonly ogDescription?: string | undefined
  readonly robots?: string | undefined
  readonly publishedTime?: string | undefined
  readonly jsonLd?: ReadonlyArray<object> | undefined
  readonly alternates?: ReadonlyArray<Locale> | undefined
}

export const seo = ({
  locale,
  path,
  title,
  description,
  type = 'website',
  image,
  imageAlt,
  ogTitle = title,
  ogDescription = description,
  robots,
  publishedTime,
  jsonLd: ld = [],
  alternates = locales,
}: SeoInput) => {
  const url = localeUrl(locale, path)
  const img = image ? new URL(image, ORIGIN).href : OG_IMAGE.url
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      ...(robots ? [{ name: 'robots', content: robots }] : []),
      { property: 'og:title', content: ogTitle },
      { property: 'og:description', content: ogDescription },
      { property: 'og:url', content: url },
      { property: 'og:site_name', content: 'Lily' },
      { property: 'og:locale', content: locale === 'fr' ? 'fr_FR' : 'en_US' },
      { property: 'og:type', content: type },
      ...(publishedTime
        ? [{ property: 'article:published_time', content: publishedTime }]
        : []),
      { property: 'og:image', content: img },
      ...(image
        ? []
        : [
            { property: 'og:image:width', content: String(OG_IMAGE.width) },
            { property: 'og:image:height', content: String(OG_IMAGE.height) },
          ]),
      { property: 'og:image:alt', content: imageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: ogTitle },
      { name: 'twitter:description', content: ogDescription },
      { name: 'twitter:image', content: img },
      {
        name: 'apple-itunes-app',
        content: `app-id=${APP_STORE_ID}, app-argument=${localeUrl(locale)}`,
      },
      ...Array.map(ld, jsonLd),
    ],
    links: [
      { rel: 'canonical', href: url },
      ...Array.map(alternates, (l) => ({
        rel: 'alternate',
        hrefLang: l,
        href: localeUrl(l, path),
      })),
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: localeUrl(defaultLocale, path),
      },
    ],
  }
}

export const breadcrumbs = (
  locale: Locale,
  items: ReadonlyArray<readonly [name: string, path: string]>
) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: Array.map(items, ([name, path], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: localeUrl(locale, path),
  })),
})
