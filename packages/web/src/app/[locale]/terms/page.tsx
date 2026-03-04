import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Terms' })
  return { title: `${t('heading')} — Lily` }
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Terms' })

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
                href="mailto:legal@lilyapp.io"
                className="text-primary hover:text-primary-dark transition-colors"
              >
                legal@lilyapp.io
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
