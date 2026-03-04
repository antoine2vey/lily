'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const APP_STORE_URL = 'https://apps.apple.com/app/lily-plant-care/id6504462690'

export function Pricing() {
  const t = useTranslations('Pricing')

  const featureList = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`feature${i}`))
  const trustItems = [0, 1, 2, 3].map((i) => t(`trust${i}`))

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          viewport={{ once: true }}
        >
          <span className="inline-block shadow-neu-inset-sm bg-background text-primary text-sm font-semibold px-5 py-2 rounded-full mb-6">
            {t('badge')}
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-lily-text mb-4">
            {t('heading')}
          </h2>
          <p className="text-lg text-muted mb-12">{t('subheading')}</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          <motion.div
            className="shadow-neu bg-background rounded-3xl p-8 text-left"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-bold text-lily-text mb-2">
              {t('monthly')}
            </h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-lily-text">$4.99</span>
              <span className="text-muted"> {t('perMonth')}</span>
            </div>
            <ul className="space-y-3 mb-8">
              {featureList.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-3 text-lily-text"
                >
                  <span className="text-primary font-bold">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full shadow-neu-sm bg-background text-lily-text text-center py-3.5 rounded-full font-semibold hover:shadow-neu-inset transition-all duration-200"
            >
              {t('startTrial')}
            </a>
          </motion.div>

          <motion.div
            className="rounded-3xl p-8 relative text-left"
            style={{
              background: '#80ac53',
              boxShadow: '8px 8px 18px #5f8238, -8px -8px 18px #a8d06d',
            }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
            viewport={{ once: true }}
          >
            <span
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap"
              style={{
                boxShadow: '3px 3px 6px #5f8238, -3px -3px 6px #a8d06d',
                background: '#6a9145',
              }}
            >
              {t('bestValue')}
            </span>
            <h3 className="text-xl font-bold text-white mb-2">{t('annual')}</h3>
            <div className="mb-1">
              <span className="text-4xl font-bold text-white">$29.99</span>
              <span className="text-white/70"> {t('perYear')}</span>
            </div>
            <p className="text-white/70 text-sm mb-6">{t('monthlyEquiv')}</p>
            <ul className="space-y-3 mb-8">
              {featureList.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-3 text-white"
                >
                  <span className="font-bold">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3.5 rounded-full font-semibold text-primary transition-all duration-200"
              style={{
                background: 'var(--color-background)',
                boxShadow:
                  'inset 3px 3px 7px var(--neu-dark), inset -3px -3px 7px var(--neu-light)',
              }}
            >
              {t('startTrial')}
            </a>
          </motion.div>
        </div>

        <motion.div
          className="mt-10 max-w-xl mx-auto shadow-neu-inset rounded-2xl px-8 py-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.3 }}
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trustItems.map((item) => (
              <p
                key={item}
                className="flex items-start gap-2 text-sm text-muted text-left"
              >
                <span className="text-primary font-bold mt-0.5">✓</span>
                {item}
              </p>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
