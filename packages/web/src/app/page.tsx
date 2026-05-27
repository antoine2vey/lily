import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: {
    canonical: 'https://withlily.app/en',
    languages: {
      en: 'https://withlily.app/en',
      fr: 'https://withlily.app/fr',
      'x-default': 'https://withlily.app/en',
    },
  },
}

export default function RootPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0;url=/en" />
      <link rel="canonical" href="https://withlily.app/en" />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: inline locale redirect, no user input
        dangerouslySetInnerHTML={{
          __html: `(function(){var l=navigator.language||'en';location.replace(l.startsWith('fr')?'/fr':'/en')})()`,
        }}
      />
      <noscript>
        <p>
          <a href="/en">English</a> | <a href="/fr">Fran&ccedil;ais</a>
        </p>
      </noscript>
    </>
  )
}
