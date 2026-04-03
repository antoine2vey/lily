import { Array, pipe } from 'effect'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { JsonLd } from '@/components/JsonLd'
import { LatestPosts } from '@/components/LatestPosts'
import { WhatIsLily } from '@/components/WhatIsLily'

const StatsBar = dynamic(() =>
  import('@/components/StatsBar').then((m) => m.StatsBar)
)
const Features = dynamic(() =>
  import('@/components/Features').then((m) => m.Features)
)
const Testimonials = dynamic(() =>
  import('@/components/Testimonials').then((m) => m.Testimonials)
)
const FAQ = dynamic(() => import('@/components/FAQ').then((m) => m.FAQ))
const Pricing = dynamic(() =>
  import('@/components/Pricing').then((m) => m.Pricing)
)
const Footer = dynamic(() =>
  import('@/components/Footer').then((m) => m.Footer)
)

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `https://withlily.app/${locale}`,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Plant care app',
        },
      ],
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: ['/og-image.png'],
    },
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

export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'FAQ' })

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pipe(
      Array.range(0, 5),
      Array.map((i) => ({
        '@type': 'Question',
        name: t(`q${i}`),
        acceptedAnswer: { '@type': 'Answer', text: t(`a${i}`) },
      }))
    ),
  }

  return (
    <main className="pb-20 md:pb-0">
      <JsonLd data={faqSchema} />
      <Header />
      <Hero />
      <StatsBar />
      <WhatIsLily />
      <Features />
      <Testimonials />
      <FAQ />
      <Pricing />
      <LatestPosts />
      <Footer />
    </main>
  )
}
