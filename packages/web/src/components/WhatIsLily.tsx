import { getTranslations } from 'next-intl/server'

export async function WhatIsLily() {
  const t = await getTranslations('WhatIsLily')

  return (
    <section className="py-16 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-lily-text mb-6">
          {t('heading')}
        </h2>
        <p className="text-lg text-muted leading-relaxed">{t('text')}</p>
      </div>
    </section>
  )
}
