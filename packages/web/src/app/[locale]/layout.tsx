import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import { JsonLd } from '@/components/JsonLd'
import { StickyMobileCTA } from '@/components/StickyMobileCTA'
import { routing } from '@/i18n/routing'
import { Providers } from '../providers'
import '../globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

interface Props {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })

  return {
    metadataBase: new URL('https://lilyapp.io'),
    title: t('title'),
    description: t('description'),
    keywords: [
      'plant care app',
      'plant reminder',
      'plant tracker',
      'plant watering app',
      'AI plant diagnosis',
      'Lily app',
      'houseplant app',
    ],
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `https://lilyapp.io/${locale}`,
      siteName: 'Lily',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Plant care app',
        },
      ],
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: ['/og-image.png'],
    },
    icons: { icon: '/favicon.svg' },
    alternates: {
      canonical: `https://lilyapp.io/${locale}`,
      languages: {
        en: 'https://lilyapp.io/en',
        fr: 'https://lilyapp.io/fr',
      },
    },
  }
}

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Lily',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'iOS, Android',
  url: 'https://lilyapp.io',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '1024',
    bestRating: '5',
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Lily',
  url: 'https://lilyapp.io',
  logo: 'https://lilyapp.io/favicon.svg',
  sameAs: [],
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} font-sans bg-background`}>
        <JsonLd data={softwareApplicationSchema} />
        <JsonLd data={organizationSchema} />
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <StickyMobileCTA />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
