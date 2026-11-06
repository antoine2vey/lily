import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useParams,
} from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { isLocale } from '@/i18n'
import { useSmoothAnchors } from '@/lib/smooth-anchors'
import css from '../styles.css?url'

const GA_ID = import.meta.env.VITE_GA_ID ?? 'G-YX8RMN49KD'

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`

const GA_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}')`

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

// Effects run after hydration commits, so analytics never competes with it for the main thread.
const useIdleAnalytics = () =>
  useEffect(() => {
    const inject = () => {
      const s = document.createElement('script')
      s.async = true
      s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
      document.head.appendChild(s)
    }
    const idle = 'requestIdleCallback' in window
    let id = 0
    const schedule = () => {
      id = idle
        ? requestIdleCallback(inject, { timeout: 5000 })
        : window.setTimeout(inject, 3000)
    }
    if (document.readyState === 'complete') schedule()
    else addEventListener('load', schedule, { once: true })
    return () => {
      removeEventListener('load', schedule)
      if (idle) cancelIdleCallback(id)
      else clearTimeout(id)
    }
  }, [])

function RootDocument() {
  const { locale = 'en' } = useParams({ strict: false })
  useIdleAnalytics()
  useSmoothAnchors()
  return (
    <Html lang={isLocale(locale) ? locale : 'en'}>
      <Outlet />
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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static analytics queue; the tag itself loads at idle after the window load event */}
        <script dangerouslySetInnerHTML={{ __html: GA_SCRIPT }} />
        <Scripts />
      </body>
    </html>
  )
}
