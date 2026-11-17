import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useMatches,
  useParams,
} from '@tanstack/react-router'
import { Array, Option } from 'effect'
import { type ReactNode, useEffect } from 'react'
import { ConsentBanner, ConsentSettings } from '@/components/site/ConsentBanner'
import { isLocale, LANG_SCRIPT, type PageLanguage, usePageLocale } from '@/i18n'
import { setAnalytics } from '@/lib/analytics'
import { CONSENT_SCRIPT, onChoice } from '@/lib/consent'
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

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    // The page is one file for every language. See `Prerendered` in src/i18n/index.tsx.
    readonly prerendersEveryLocale?: boolean
  }
}

const usePageLanguage = (): PageLanguage => {
  const { locale } = useParams({ strict: false })
  const prerendered = useMatches({
    select: (matches) =>
      Array.some(
        matches,
        (match) => match.staticData.prerendersEveryLocale === true
      ),
  })
  return Option.match(Option.filter(Option.fromNullishOr(locale), isLocale), {
    onSome: (known) => ({ _tag: 'Locale', locale: known }),
    onNone: () => ({ _tag: prerendered ? 'Prerendered' : 'Hydrated' }),
  })
}

function RootDocument() {
  const page = usePageLanguage()
  useAnalytics()
  useSmoothAnchors()
  return (
    <Html page={page}>
      <ConsentBanner page={page} />
      <Outlet />
      {page._tag !== 'Locale' && <ConsentSettings />}
    </Html>
  )
}

function Html({ page, children }: { page: PageLanguage; children: ReactNode }) {
  return (
    <html lang={usePageLocale(page)} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script, runs before paint to avoid a flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static consent script, runs before paint so a stored choice hides the prerendered banner */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_SCRIPT }} />
        {page._tag === 'Prerendered' && (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static language script, runs before paint so the page shows the copy in the browser language
          <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
        )}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
