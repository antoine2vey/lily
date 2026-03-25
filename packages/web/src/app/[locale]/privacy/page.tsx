import { Array, pipe, String } from 'effect'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Privacy' })
  const title = `${t('heading')} — Lily`

  return {
    title,
    description: t('metaDescription'),
    openGraph: {
      title,
      description: t('metaDescription'),
      url: `https://withlily.app/${locale}/privacy`,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Privacy Policy',
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
      canonical: `https://withlily.app/${locale}/privacy`,
      languages: {
        en: 'https://withlily.app/en/privacy',
        fr: 'https://withlily.app/fr/privacy',
        'x-default': 'https://withlily.app/en/privacy',
      },
    },
  }
}

function ItemList({ items }: { items: string }) {
  return (
    <ul className="list-disc pl-6 mt-3 space-y-2">
      {pipe(
        items,
        String.split('|'),
        Array.map((item) => (
          <li key={item} className="text-muted leading-relaxed">
            {item}
          </li>
        ))
      )}
    </ul>
  )
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Privacy' })

  return (
    <main className="min-h-screen bg-background py-16 px-6">
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
        <p className="text-muted mb-6">{t('lastUpdated')}</p>
        <p className="text-muted mb-12 leading-relaxed">{t('intro')}</p>

        <div className="space-y-10 text-lily-text leading-relaxed">
          {/* 1. Data Controller */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s1Heading')}</h2>
            <p className="text-muted">{t('s1Text')}</p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s2Heading')}</h2>
            <p className="text-muted">{t('s2Text')}</p>
            <h3 className="text-lg font-semibold mt-6 mb-2">
              {t('s2Cat1Title')}
            </h3>
            <ItemList items={t('s2Cat1Items')} />
            <h3 className="text-lg font-semibold mt-6 mb-2">
              {t('s2Cat2Title')}
            </h3>
            <ItemList items={t('s2Cat2Items')} />
            <h3 className="text-lg font-semibold mt-6 mb-2">
              {t('s2Cat3Title')}
            </h3>
            <ItemList items={t('s2Cat3Items')} />
          </section>

          {/* 3. Legal Basis */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s3Heading')}</h2>
            <p className="text-muted">{t('s3Text')}</p>
            <ItemList items={t('s3Items')} />
          </section>

          {/* 4. How We Use Data */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s4Heading')}</h2>
            <p className="text-muted">{t('s4Text')}</p>
            <ItemList items={t('s4Items')} />
            <p className="text-muted mt-4">{t('s4Text2')}</p>
          </section>

          {/* 5. Data Sharing */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s5Heading')}</h2>
            <p className="text-muted">{t('s5Text')}</p>
            <ItemList items={t('s5Items')} />
            <p className="text-muted mt-4">{t('s5Text2')}</p>
          </section>

          {/* 6. Data Retention */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s6Heading')}</h2>
            <p className="text-muted">{t('s6Text')}</p>
            <ItemList items={t('s6Items')} />
          </section>

          {/* 7. Data Storage & Security */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s7Heading')}</h2>
            <p className="text-muted">{t('s7Text')}</p>
            <ItemList items={t('s7Items')} />
            <p className="text-muted mt-4">{t('s7Text2')}</p>
          </section>

          {/* 8. International Transfers */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s8Heading')}</h2>
            <p className="text-muted">{t('s8Text')}</p>
          </section>

          {/* 9. Cookies */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s9Heading')}</h2>
            <p className="text-muted">{t('s9Text')}</p>
            <ItemList items={t('s9Items')} />
            <p className="text-muted mt-4">{t('s9Text2')}</p>
          </section>

          {/* 10. Your Rights */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s10Heading')}</h2>
            <p className="text-muted">{t('s10Text')}</p>
            <ItemList items={t('s10Items')} />
            <p className="text-muted mt-4">{t('s10Text2')}</p>
          </section>

          {/* 11. Children's Privacy */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s11Heading')}</h2>
            <p className="text-muted">{t('s11Text')}</p>
          </section>

          {/* 12. Changes */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('s12Heading')}</h2>
            <p className="text-muted">{t('s12Text')}</p>
          </section>

          {/* 13. Contact */}
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('contactHeading')}</h2>
            <p className="text-muted">
              {t('contactText')}{' '}
              <a
                href="mailto:privacy@withlily.app"
                className="text-primary hover:text-primary-dark transition-colors"
              >
                privacy@withlily.app
              </a>
              .
            </p>
            <p className="text-muted mt-3">{t('contactAddress')}</p>
          </section>
        </div>
      </div>
    </main>
  )
}
