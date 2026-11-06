import { createFileRoute } from '@tanstack/react-router'
import { localeUrl } from '@/lib/seo'

const REDIRECT = `(function(){var l=navigator.language||'en';location.replace(l.slice(0,2)==='fr'?'/fr':'/en')})()`

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Lily — Plant care app' },
      { name: 'robots', content: 'noindex, follow' },
      { httpEquiv: 'refresh', content: '0;url=/en' },
    ],
    links: [
      { rel: 'canonical', href: localeUrl('en') },
      { rel: 'alternate', hrefLang: 'en', href: localeUrl('en') },
      { rel: 'alternate', hrefLang: 'fr', href: localeUrl('fr') },
      { rel: 'alternate', hrefLang: 'x-default', href: localeUrl('en') },
    ],
  }),
  component: RootRedirect,
})

function RootRedirect() {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static locale redirect, no user input */}
      <script dangerouslySetInnerHTML={{ __html: REDIRECT }} />
      <noscript>
        <p>
          <a href="/en">English</a> | <a href="/fr">Français</a>
        </p>
      </noscript>
    </>
  )
}
