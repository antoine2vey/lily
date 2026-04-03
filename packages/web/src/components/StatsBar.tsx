'use client'

import { useTranslations } from 'next-intl'
import { FadeIn } from '@/components/FadeIn'

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
        <FadeIn className="shadow-neu-inset rounded-2xl px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <FadeIn
                key={stat.label}
                className="text-center"
                delay={index * 100}
              >
                <div className="text-3xl font-bold text-primary mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-muted">{stat.label}</div>
              </FadeIn>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
