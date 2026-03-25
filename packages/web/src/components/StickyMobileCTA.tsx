'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const APP_STORE_URL = 'https://apps.apple.com/app/lily-plant-care/id6504462690'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.plants'

export function StickyMobileCTA() {
  const [pricingVisible, setPricingVisible] = useState(false)
  const t = useTranslations('Hero')

  useEffect(() => {
    const pricing = document.getElementById('pricing')
    if (!pricing) return

    const observer = new IntersectionObserver(
      ([entry]) => setPricingVisible(entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(pricing)
    return () => observer.disconnect()
  }, [])

  if (pricingVisible) return null

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background px-4 py-3 flex gap-3"
      style={{ boxShadow: '0 -4px 10px var(--neu-dark)' }}
    >
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 inline-flex items-center justify-center gap-2 shadow-neu-sm bg-background text-lily-text py-3 rounded-full text-sm font-semibold hover:shadow-neu-inset transition-all duration-200"
      >
        <span>🍎</span> {t('appStore')}
      </a>
      <a
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 inline-flex items-center justify-center gap-2 shadow-neu-sm bg-background text-lily-text py-3 rounded-full text-sm font-semibold hover:shadow-neu-inset transition-all duration-200"
      >
        <span>▶</span> {t('googlePlay')}
      </a>
    </div>
  )
}
