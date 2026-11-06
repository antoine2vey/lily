import { type Locale, messagesFor } from '@/i18n'
import { breadcrumbs, seo } from './seo'

type DocKey = 'About' | 'Team' | 'Privacy' | 'Terms' | 'Support'

// Content pages share one head shape: "<heading> — Lily", a breadcrumb from home, and optional extra JSON-LD.
export const docHead = (
  locale: Locale,
  key: DocKey,
  path: string,
  jsonLd: ReadonlyArray<object> = []
) => {
  const { heading, metaDescription } = messagesFor(locale)[key]
  return seo({
    locale,
    path,
    title: `${heading} — Lily`,
    description: metaDescription,
    imageAlt: `Lily — ${heading}`,
    jsonLd: [
      breadcrumbs(locale, [
        ['Lily', ''],
        [heading, path],
      ]),
      ...jsonLd,
    ],
  })
}
