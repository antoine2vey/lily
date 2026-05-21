import { Array, pipe, String } from 'effect'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { JsonLd } from '@/components/JsonLd'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Support' })
  const title = `${t('heading')} — Lily`

  return {
    title,
    description: t('metaDescription'),
    openGraph: {
      title,
      description: t('metaDescription'),
      url: `https://withlily.app/${locale}/support`,
      type: 'website',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Lily — Support',
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
      canonical: `https://withlily.app/${locale}/support`,
      languages: {
        en: 'https://withlily.app/en/support',
        fr: 'https://withlily.app/fr/support',
        'x-default': 'https://withlily.app/en/support',
      },
    },
  }
}

interface FaqItem {
  question: string
  answer: string
}

function parseFaqs(raw: string): ReadonlyArray<FaqItem> {
  return pipe(
    raw,
    String.split('|'),
    Array.map((entry) => {
      const [question, answer] = entry.split('::')
      return { question: question ?? '', answer: answer ?? '' }
    })
  )
}

export default async function SupportPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Support' })

  const faqs = parseFaqs(t('faqs'))

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
        item: `https://withlily.app/${locale}/support`,
      },
    ],
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: Array.map(faqs, (faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  return (
    <main className="min-h-screen bg-background py-16 px-6">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
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
        <p className="text-muted mb-12 leading-relaxed">{t('intro')}</p>

        <div className="space-y-10 text-lily-text leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('contactHeading')}</h2>
            <p className="text-muted">
              {t('contactText')}{' '}
              <a
                href="mailto:support@withlily.app"
                className="text-primary hover:text-primary-dark transition-colors"
              >
                support@withlily.app
              </a>
              .
            </p>
            <p className="text-muted mt-3">{t('contactResponseTime')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6">{t('faqHeading')}</h2>
            <div className="space-y-6">
              {Array.map(faqs, (faq) => (
                <div key={faq.question}>
                  <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
                  <p className="text-muted">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">{t('accountHeading')}</h2>
            <p className="text-muted">
              {t('accountText')}{' '}
              <a
                href="mailto:privacy@withlily.app"
                className="text-primary hover:text-primary-dark transition-colors"
              >
                privacy@withlily.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">{t('linksHeading')}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <Link
                  href={`/${locale}/privacy`}
                  className="text-primary hover:text-primary-dark transition-colors"
                >
                  {t('linkPrivacy')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/terms`}
                  className="text-primary hover:text-primary-dark transition-colors"
                >
                  {t('linkTerms')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/blog`}
                  className="text-primary hover:text-primary-dark transition-colors"
                >
                  {t('linkBlog')}
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
