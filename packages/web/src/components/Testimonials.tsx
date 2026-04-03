'use client'

import { useTranslations } from 'next-intl'
import { FadeIn } from '@/components/FadeIn'

const APP_STORE_URL = 'https://apps.apple.com/app/lily-plant-care/id6504462690'

export function Testimonials() {
  const t = useTranslations('Testimonials')

  const testimonials = [0, 1, 2].map((i) => ({
    quote: t(`quote${i}`),
    name: t(`name${i}`),
    detail: t(`detail${i}`),
  }))

  return (
    <section className="py-24 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <FadeIn className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold text-lily-text mb-4">
            {t('heading')}
          </h2>
          <p className="text-lg text-muted">{t('subheading')}</p>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8 mb-10">
          {testimonials.map((testimonial, index) => (
            <FadeIn
              key={testimonial.name}
              className="shadow-neu bg-background rounded-3xl p-8 flex flex-col gap-4"
              delay={index * 150}
            >
              <div className="text-primary text-xl leading-none">★★★★★</div>
              <p className="text-lily-text leading-relaxed flex-1">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex items-center gap-2 text-sm text-muted font-medium">
                <span className="text-lily-text font-semibold">
                  {testimonial.name}
                </span>
                <span>&middot;</span>
                <span>{testimonial.detail}</span>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn className="text-center" delay={500}>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-lily-text transition-colors"
          >
            <span className="text-primary">★★★★★</span>
            <span>{t('ratingBadge')}</span>
          </a>
        </FadeIn>
      </div>
    </section>
  )
}
