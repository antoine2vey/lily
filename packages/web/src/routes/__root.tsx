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
import { defaultLocale, isLocale } from '@/i18n'
import { setAnalytics } from '@/lib/analytics'
import { onChoice } from '@/lib/consent'
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

const useAnalytics = () =>
  useEffect(
    () =>
      onChoice((choice) => setAnalytics(Option.contains(choice, 'granted'))),
    []
  )

function RootDocument() {
  const { locale } = useParams({ strict: false })
  const known = Option.filter(Option.fromNullishOr(locale), isLocale)
  useAnalytics()
  useSmoothAnchors()
  return (
    <Html lang={Option.getOrElse(known, () => defaultLocale)}>
      <ConsentBanner locale={known} />
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
        <Scripts />
      </body>
    </html>
  )
}
