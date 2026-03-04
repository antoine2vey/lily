'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

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
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-lily-text mb-4">
            {t('heading')}
          </h2>
          <p className="text-lg text-muted">{t('subheading')}</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mb-10">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              className="shadow-neu bg-background rounded-3xl p-8 flex flex-col gap-4"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                ease: 'easeOut',
                delay: index * 0.15,
              }}
              viewport={{ once: true }}
            >
              <div className="text-primary text-xl leading-none">★★★★★</div>
              <p className="text-lily-text leading-relaxed flex-1">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex items-center gap-2 text-sm text-muted font-medium">
                <span className="text-lily-text font-semibold">
                  {testimonial.name}
                </span>
                <span>·</span>
                <span>{testimonial.detail}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          viewport={{ once: true }}
        >
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-lily-text transition-colors"
          >
            <span className="text-primary">★★★★★</span>
            <span>{t('ratingBadge')}</span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}
