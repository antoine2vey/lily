import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'
import { I18nProvider, isLocale, type Locale } from '@/i18n'
import { author, authorRef } from '@/lib/authors'
import { jsonLd } from '@/lib/seo'
import { APP_STORE_URL, ORIGIN } from '@/lib/site'

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Lily',
  description:
    'Plant care app with watering reminders that adapt to season, light and weather, plus AI plant diagnosis and care guides for your houseplants.',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'iOS',
  url: ORIGIN,
  downloadUrl: APP_STORE_URL,
  screenshot: `${ORIGIN}/screenshots/home-screen.webp`,
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: '24.99',
    priceCurrency: 'USD',
    offerCount: '3',
  },
}

const organization = (locale: Locale) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${ORIGIN}/#organization`,
  name: 'Lily',
  url: ORIGIN,
  logo: `${ORIGIN}/apple-touch-icon.png`,
  founder: authorRef(locale),
  sameAs: [APP_STORE_URL, author.source],
})

const webSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${ORIGIN}/#website`,
  name: 'Lily',
  url: ORIGIN,
  publisher: { '@type': 'Organization', name: 'Lily', url: ORIGIN },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${ORIGIN}/en/blog?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

export const Route = createFileRoute('/$locale')({
  params: {
    parse: ({ locale }) => {
      if (!isLocale(locale)) throw notFound()
      return { locale: locale as Locale }
    },
    stringify: ({ locale }) => ({ locale }),
  },
  head: ({ params: { locale } }) => ({
    meta: [
      jsonLd(softwareApplication),
      jsonLd(organization(locale)),
      jsonLd(webSite),
    ],
    links: [
      { rel: 'dns-prefetch', href: 'https://www.googletagmanager.com' },
      {
        rel: 'preconnect',
        href: 'https://www.googletagmanager.com',
        crossOrigin: 'anonymous',
      },
    ],
  }),
  component: LocaleLayout,
})

function LocaleLayout() {
  const { locale } = Route.useParams()
  return (
    <I18nProvider locale={locale}>
      <Header />
      <Outlet />
      <Footer />
    </I18nProvider>
  )
}
