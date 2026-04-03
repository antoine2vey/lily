import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { JsonLd } from '@/components/JsonLd'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'About' })
  const title = `${t('heading')} — Lily`

  return {
    title,
    description: t('metaDescription'),
    openGraph: {
      title,
      description: t('metaDescription'),
      url: `https://withlily.app/${locale}/about`,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — About Us',
        },
      ],
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: t('metaDescription'),
      images: ['/og-image.png'],
    },
    alternates: {
      canonical: `https://withlily.app/${locale}/about`,
      languages: {
        en: 'https://withlily.app/en/about',
        fr: 'https://withlily.app/fr/about',
        'x-default': 'https://withlily.app/en/about',
      },
    },
  }
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'About' })

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Lily',
        item: `https://withlily.app/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('heading'),
        item: `https://withlily.app/${locale}/about`,
      },
    ],
  }

  return (
    <main className="min-h-screen bg-background py-16 px-6">
      <JsonLd data={breadcrumbSchema} />
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/${locale}`}
          className="text-primary text-sm font-semibold mb-8 inline-block hover:text-primary-dark transition-colors"
        >
          {t('back')}
        </Link>
        <h1 className="text-4xl font-bold text-lily-text mb-4">
          {t('introHeading')}
        </h1>
        <p className="text-muted mb-12 leading-relaxed">{t('introText')}</p>

        <div className="space-y-10 text-lily-text leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('storyHeading')}</h2>
            <p className="text-muted">{t('storyText1')}</p>
            <p className="text-muted mt-4">{t('storyText2')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">{t('missionHeading')}</h2>
            <p className="text-muted">{t('missionText1')}</p>
            <p className="text-muted mt-4">{t('missionText2')}</p>
          </section>

          <section className="mt-16 p-8 shadow-neu rounded-2xl bg-background text-center">
            <p className="text-2xl font-bold text-lily-text mb-3">
              {t('ctaHeading')}
            </p>
            <p className="text-muted mb-6">{t('ctaText')}</p>
            <a
              href="https://apps.apple.com/app/lily-plant-care/id6504462690"
              className="inline-block bg-primary hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-full transition-colors"
            >
              {t('ctaButton')}
            </a>
          </section>
        </div>
      </div>
    </main>
  )
}
