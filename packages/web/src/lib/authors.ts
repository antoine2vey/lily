import type { Locale } from '@/i18n'
import { localeUrl } from './seo'
import { ORIGIN } from './site'

export const author = {
  name: 'Antoine de Veyrac',
  id: `${ORIGIN}/#antoine-de-veyrac`,
  site: 'https://antoinedeveyrac.fr',
  github: 'https://github.com/antoine2vey',
  linkedin: 'https://www.linkedin.com/in/antoine-de-veyrac-31b467112/',
  source: 'https://github.com/antoine2vey/lily',
} as const

export const authorRef = (locale: Locale) => ({
  '@type': 'Person',
  '@id': author.id,
  name: author.name,
  url: localeUrl(locale, '/team'),
})

export const authorJsonLd = (locale: Locale, jobTitle: string) => ({
  '@context': 'https://schema.org',
  ...authorRef(locale),
  jobTitle,
  worksFor: { '@type': 'Organization', name: 'Lily', url: ORIGIN },
  sameAs: [author.site, author.github, author.linkedin],
})
