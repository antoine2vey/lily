import { getLocale, getTranslations } from 'next-intl/server'

const APP_STORE_URL = 'https://apps.apple.com/app/with-lily/id6758399014'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.plants'

export async function Footer() {
  const t = await getTranslations('Footer')
  const locale = await getLocale()

  return (
    <footer className="bg-background pt-12 pb-8">
      <div className="max-w-5xl mx-auto px-6">
        <div className="shadow-neu-inset rounded-2xl px-8 py-10 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🌿</span>
                <span className="text-xl font-bold text-lily-text">Lily</span>
              </div>
              <p className="text-muted text-sm">{t('tagline')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 shadow-neu-sm bg-background text-lily-text px-5 py-2.5 rounded-full text-sm font-medium hover:shadow-neu-inset-sm transition-all duration-200"
              >
                <span>🍎</span> {t('appStore')}
              </a>
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 shadow-neu-sm bg-background text-lily-text px-5 py-2.5 rounded-full text-sm font-medium hover:shadow-neu-inset-sm transition-all duration-200"
              >
                <span>▶</span> {t('googlePlay')}
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-muted text-sm">
          <p>{t('copyright')}</p>
          <div className="flex gap-6">
            <a
              href={`/${locale}/blog`}
              className="hover:text-lily-text transition-colors"
            >
              {t('blog')}
            </a>
            <a
              href={`/${locale}/privacy`}
              className="hover:text-lily-text transition-colors"
            >
              {t('privacy')}
            </a>
            <a
              href={`/${locale}/terms`}
              className="hover:text-lily-text transition-colors"
            >
              {t('terms')}
            </a>
            <a
              href={`/${locale}/support`}
              className="hover:text-lily-text transition-colors"
            >
              {t('support')}
            </a>
            <a
              href="mailto:hello@withlily.app"
              className="hover:text-lily-text transition-colors"
            >
              {t('contact')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
