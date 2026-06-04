'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { FadeIn } from '@/components/FadeIn'

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const t = useTranslations('FAQ')

  const faqs = [0, 1, 2, 3, 4].map((i) => ({
    question: t(`q${i}`),
    answer: t(`a${i}`),
  }))

  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <FadeIn className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold text-lily-text mb-4">
            {t('heading')}
          </h2>
          <p className="text-lg text-muted">{t('subheading')}</p>
        </FadeIn>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <FadeIn
              key={faq.question}
              className="rounded-2xl overflow-hidden"
              delay={index * 70}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className={`w-full flex items-center justify-between gap-4 px-7 py-5 text-left font-semibold text-lily-text transition-all duration-200 ${openIndex === index ? 'shadow-neu-inset-sm bg-background rounded-t-2xl' : 'shadow-neu bg-background rounded-2xl hover:shadow-neu-inset-sm'}`}
              >
                <span>{faq.question}</span>
                <span
                  className={`text-primary text-xl shrink-0 transition-transform duration-200 ${openIndex === index ? 'rotate-45' : ''}`}
                >
                  +
                </span>
              </button>

              <div
                className="grid transition-all duration-250 ease-in-out"
                style={{
                  gridTemplateRows: openIndex === index ? '1fr' : '0fr',
                  opacity: openIndex === index ? 1 : 0,
                }}
              >
                <div className="overflow-hidden">
                  <div className="shadow-neu-inset bg-background rounded-b-2xl px-7 py-5 text-muted leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
