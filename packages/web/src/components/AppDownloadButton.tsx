'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { AppleIcon, GooglePlayIcon } from '@/components/BrandIcons'

const APP_STORE_URL = 'https://apps.apple.com/app/with-lily/id6758399014'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.plants'

type Platform = 'ios' | 'android' | 'web'

// Static export ships one HTML for everyone, so the platform is only knowable
// after hydration. Default to 'web' (show both stores) — it matches the server
// render and is the honest choice when we can't be sure. Only collapse to a
// single store when we're confident the device is iOS or Android.
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as "Macintosh" but is a multi-touch device
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  return isIOS ? 'ios' : 'web'
}

const STORE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 shadow-neu-sm bg-background text-lily-text px-6 py-3 rounded-full font-semibold hover:shadow-neu-inset transition-all duration-200'

interface Props {
  // Label for the single, platform-specific CTA (e.g. "Download Lily Free →")
  label: string
  // Styling for that single primary CTA button
  className?: string
}

export function AppDownloadButton({ label, className }: Props) {
  const t = useTranslations('Hero')
  const [platform, setPlatform] = useState<Platform>('web')

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  if (platform === 'ios' || platform === 'android') {
    const href = platform === 'android' ? GOOGLE_PLAY_URL : APP_STORE_URL
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    )
  }

  // Web / unknown — we can't be sure, so offer both stores.
  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={STORE_BUTTON_CLASS}
      >
        <AppleIcon className="w-5 h-5" />
        {t('appStore')}
      </a>
      <a
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={STORE_BUTTON_CLASS}
      >
        <GooglePlayIcon className="w-5 h-5" />
        {t('googlePlay')}
      </a>
    </div>
  )
}
