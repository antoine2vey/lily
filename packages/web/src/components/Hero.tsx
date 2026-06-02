import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

const APP_STORE_URL = 'https://apps.apple.com/app/with-lily/id6758399014'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.plants'

export async function Hero() {
  const t = await getTranslations('Hero')

  return (
    <section className="min-h-screen flex items-center justify-center bg-background pt-16">
      <div className="max-w-6xl mx-auto px-6 py-16 w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div
            className="text-center md:text-left"
            style={{ animation: 'fade-in-up 0.7s ease-out both' }}
          >
            <div className="inline-flex items-center gap-2 shadow-neu-inset-sm bg-background text-primary font-medium px-5 py-2 rounded-full text-sm mb-8">
              <span>🌱</span>
              <span>{t('badge')}</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold text-lily-text leading-tight mb-6">
              {t('headline1')}
              <br />
              <span className="text-primary">{t('headline2')}</span>
            </h1>

            <p className="text-xl text-muted max-w-xl mb-6 leading-relaxed">
              {t('subheadline')}
            </p>

            <div className="inline-flex items-center gap-2 mb-8 shadow-neu-inset-sm bg-background px-5 py-2 rounded-full">
              <span className="text-primary text-lg leading-none">★★★★★</span>
              <span className="text-sm font-semibold text-lily-text">
                {t('rating')}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 justify-center md:justify-start">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 shadow-neu-sm bg-background text-lily-text px-7 py-3.5 rounded-full font-semibold hover:shadow-neu-inset transition-all duration-200"
              >
                <span>🍎</span>
                {t('appStore')}
              </a>
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 shadow-neu-sm bg-background text-lily-text px-7 py-3.5 rounded-full font-semibold hover:shadow-neu-inset transition-all duration-200"
              >
                <span>▶</span>
                {t('googlePlay')}
              </a>
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className="w-64 rounded-[3rem] shadow-neu-lg overflow-hidden"
              style={{
                animation: 'fade-in-up 0.8s 0.3s ease-out forwards',
                opacity: 1,
              }}
            >
              <Image
                src="/screenshots/home-screen.webp"
                alt="Lily app home screen"
                width={256}
                height={554}
                className="w-full h-auto"
                priority
                sizes="256px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
