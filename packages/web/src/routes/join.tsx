import { createFileRoute } from '@tanstack/react-router'
import { JoinInvite } from '@/components/site/JoinInvite'
import { messagesFor } from '@/i18n'
import { OG_IMAGE } from '@/lib/site'

const { metaTitle: title, metaDescription: description } =
  messagesFor('en').Join

export const Route = createFileRoute('/join')({
  head: () => ({
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:site_name', content: 'Lily' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: OG_IMAGE.url },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: JoinInvite,
})
