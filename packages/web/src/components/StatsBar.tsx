'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

export function StatsBar() {
  const t = useTranslations('StatsBar')

  const stats = [
    { value: '10,000+', label: t('plantsTracked') },
    { value: '4.8★', label: t('appStoreRating') },
    { value: '7-day', label: t('freeTrial') },
    { value: '$0', label: t('toStart') },
  ]

  return (
    <section className="py-12 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          className="shadow-neu-inset rounded-2xl px-8 py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="text-center"
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                  delay: index * 0.1,
                }}
                viewport={{ once: true }}
              >
                <div className="text-3xl font-bold text-primary mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-muted">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
