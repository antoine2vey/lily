import en from 'virtual:post-index/en'
import fr from 'virtual:post-index/fr'
import { createFileRoute } from '@tanstack/react-router'
import { sitemapXml, siteUrls } from '@/lib/sitemap'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          sitemapXml(siteUrls((locale) => (locale === 'en' ? en : fr))),
          {
            headers: { 'content-type': 'application/xml; charset=utf-8' },
          }
        ),
    },
  },
})
