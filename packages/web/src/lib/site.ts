import type { Locale } from '@/i18n'

export const ORIGIN = 'https://withlily.app'
export const APP_STORE_ID = '6758399014'
export const APP_STORE_PROVIDER_ID = '125135094'
export const APP_STORE_URL = `https://apps.apple.com/app/with-lily/id${APP_STORE_ID}`

export type PageKind = 'home' | 'page' | 'blog' | 'post' | 'tool' | 'join'

// The join page is one prerendered file for both languages, so its campaign cannot name a locale.
export type Campaign = 'web-join' | `web-${Exclude<PageKind, 'join'>}-${Locale}`

export const appStoreUrl = (campaign: Campaign): string =>
  `${APP_STORE_URL}?pt=${APP_STORE_PROVIDER_ID}&ct=${campaign}&mt=8`

// The Play listing returns 404 until the Android release. Flip this when it is public.
export const PLAY_STORE_LIVE = false
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.app'
export const OG_IMAGE = {
  url: `${ORIGIN}/og-image.png`,
  width: 1200,
  height: 630,
}
