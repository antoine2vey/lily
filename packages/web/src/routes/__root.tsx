import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useParams,
} from '@tanstack/react-router'
import { Option } from 'effect'
import { type ReactNode, useEffect } from 'react'
import { ConsentBanner } from '@/components/site/ConsentBanner'
import { isLocale } from '@/i18n'
import { startAnalytics, stopAnalytics } from '@/lib/analytics'
import { useConsent } from '@/lib/consent'
import { useSmoothAnchors } from '@/lib/smooth-anchors'
import css from '../styles.css?url'

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [
      { rel: 'stylesheet', href: css },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        href: '/icon-192.png',
      },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  component: RootDocument,
})

const useAnalytics = () => {
  const granted = Option.contains(useConsent().choice, 'granted')
  useEffect(() => {
    if (granted) return startAnalytics()
    stopAnalytics()
    return undefined
  }, [granted])
}

function RootDocument() {
  const { locale } = useParams({ strict: false })
  const known = locale !== undefined && isLocale(locale) ? locale : undefined
  useAnalytics()
  useSmoothAnchors()
  return (
    <Html lang={known ?? 'en'}>
      <Outlet />
      <ConsentBanner locale={known} />
    </Html>
  )
}

function Html({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script, runs before paint to avoid a flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
