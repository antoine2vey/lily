import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site'
import { AppleIcon, GooglePlayIcon } from './icons'

type Platform = 'ios' | 'android' | 'web'

// The prerendered HTML is shared by every visitor, so render both stores and
// only collapse to one after hydration when the device is clearly iOS or Android.
const detectPlatform = (): Platform => {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  return /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    ? 'ios'
    : 'web'
}

export const usePlatform = (): Platform => {
  const [platform, setPlatform] = useState<Platform>('web')
  useEffect(() => setPlatform(detectPlatform()), [])
  return platform
}

const STORES = {
  ios: { href: APP_STORE_URL, Icon: AppleIcon, label: 'appStore' },
  android: { href: PLAY_STORE_URL, Icon: GooglePlayIcon, label: 'googlePlay' },
} as const

export function StoreButtons({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { m } = useI18n()
  const platform = usePlatform()
  const shown =
    platform === 'web' ? (['ios', 'android'] as const) : ([platform] as const)
  const pad = size === 'sm' ? 'px-4 py-2 text-sm' : 'px-5 py-3'
  return (
    <div className="flex flex-wrap gap-3">
      {shown.map((p, i) => {
        const { href, Icon, label } = STORES[p]
        return (
          <a
            key={p}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 rounded-full font-semibold transition-transform hover:-translate-y-0.5 ${pad} ${
              i === 0
                ? 'bg-ink text-bg'
                : 'bg-surface text-ink ring-1 ring-line'
            }`}
          >
            <Icon className="size-4" />
            {m.Footer[label]}
          </a>
        )
      })}
    </div>
  )
}
