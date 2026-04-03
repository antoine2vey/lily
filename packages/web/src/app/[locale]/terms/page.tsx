import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { JsonLd } from '@/components/JsonLd'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Terms' })
  const title = `${t('heading')} — Lily`

  return {
    title,
    description: t('metaDescription'),
    openGraph: {
      title,
      description: t('metaDescription'),
      url: `https://withlily.app/${locale}/terms`,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Terms of Service',
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
      canonical: `https://withlily.app/${locale}/terms`,
      languages: {
        en: 'https://withlily.app/en/terms',
        fr: 'https://withlily.app/fr/terms',
        'x-default': 'https://withlily.app/en/terms',
      },
    },
  }
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Terms' })

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
        item: `https://withlily.app/${locale}/terms`,
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
          {t('heading')}
        </h1>
        <p className="text-muted mb-12">{t('lastUpdated')}</p>
        <div className="space-y-10 text-lily-text leading-relaxed">
          {(['s1', 's2', 's3', 's4'] as const).map((s) => (
            <section key={s}>
              <h2 className="text-2xl font-bold mb-4">{t(`${s}Heading`)}</h2>
              <p className="text-muted">{t(`${s}Text`)}</p>
            </section>
          ))}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s5Heading')}</h2>
            <p className="text-muted">
              {t('s5Text')}{' '}
              <a
                href="mailto:legal@withlily.app"
                className="text-primary hover:text-primary-dark transition-colors"
              >
                legal@withlily.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
