'use client'

import { Array, pipe } from 'effect'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const t = useTranslations('FAQ')

  const faqs = pipe(
    [0, 1, 2, 3, 4, 5],
    Array.map((i) => ({
      question: t(`q${i}`),
      answer: t(`a${i}`),
    }))
  )

  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6">
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

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              className="rounded-2xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: index * 0.07,
              }}
              viewport={{ once: true }}
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

              <AnimatePresence initial={false}>
                {openIndex === index && (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="shadow-neu-inset bg-background rounded-b-2xl px-7 py-5 text-muted leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
