import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { notFound } from 'next/navigation'
import Script from 'next/script'
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
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
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
    metadataBase: new URL('https://withlily.app'),
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
      url: `https://withlily.app/${locale}`,
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
    icons: {
      icon: '/favicon.svg',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.json',
    alternates: {
      canonical: `https://withlily.app/${locale}`,
      languages: {
        en: 'https://withlily.app/en',
        fr: 'https://withlily.app/fr',
        'x-default': 'https://withlily.app/en',
      },
    },
  }
}

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Lily',
  description:
    'Plant care app with smart reminders, AI diagnosis, and personalized care guides for your houseplants.',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'iOS, Android',
  url: 'https://withlily.app',
  downloadUrl: 'https://apps.apple.com/app/lily-plant-care/id6504462690',
  screenshot: 'https://withlily.app/screenshots/home-screen.webp',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: '29.99',
    priceCurrency: 'USD',
    offerCount: '3',
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Lily',
  url: 'https://withlily.app',
  logo: 'https://withlily.app/apple-touch-icon.png',
  sameAs: [
    'https://apps.apple.com/app/lily-plant-care/id6504462690',
    'https://play.google.com/store/apps/details?id=com.lilyapp.plants',
  ],
}

const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://withlily.app/#website',
  name: 'Lily',
  url: 'https://withlily.app',
  publisher: {
    '@type': 'Organization',
    name: 'Lily',
    url: 'https://withlily.app',
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://withlily.app/en/blog?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
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
      <head>
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link
          rel="preconnect"
          href="https://www.googletagmanager.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${spaceGrotesk.variable} font-sans bg-background`}>
        <JsonLd data={softwareApplicationSchema} />
        <JsonLd data={organizationSchema} />
        <JsonLd data={webSiteSchema} />
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {children}
            <StickyMobileCTA />
          </Providers>
        </NextIntlClientProvider>
        <Script
          id="ga-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID ?? 'G-YX8RMN49KD'}`}
          strategy="lazyOnload"
        />
        <Script id="ga-init" strategy="lazyOnload">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${process.env.NEXT_PUBLIC_GA_ID ?? 'G-YX8RMN49KD'}');`}
        </Script>
      </body>
    </html>
  )
}
