import { createFileRoute } from '@tanstack/react-router'
import { Array } from 'effect'
import { useRef } from 'react'
import '@/components/home/home.css'
import '@/components/home/story.css'
import { Bits } from '@/components/home/bits/Bits'
import { Faq } from '@/components/home/Faq'
import { LatestPosts } from '@/components/home/LatestPosts'
import { useLive } from '@/components/home/live'
import { Pricing } from '@/components/home/Pricing'
import { Proof } from '@/components/home/Proof'
import { Sprite } from '@/components/home/Sprite'
import { Story } from '@/components/home/Story'
import { StorySprite } from '@/components/home/StorySprite'
import { Timelapse } from '@/components/home/Timelapse'
import { Together } from '@/components/home/Together'
import { WaterCombo } from '@/components/home/WaterCombo'
import { CtaBand } from '@/components/site/CtaBand'
import { messagesFor } from '@/i18n'
import { seo } from '@/lib/seo'

const loadMag = () => import('@/components/home/engines/mag')

export const Route = createFileRoute('/$locale/')({
  loader: async ({ params }) => {
    const index = await (await import('@/lib/post-data')).postIndex(
      params.locale
    )
    return { posts: Array.take(index, 3), total: index.length }
  },
  head: ({ params }) => {
    const { metadata, Faq: faq } = messagesFor(params.locale)
    return seo({
      locale: params.locale,
      path: '',
      title: metadata.title,
      description: metadata.description,
      ogTitle: metadata.ogTitle,
      ogDescription: metadata.ogDescription,
      imageAlt: metadata.imageAlt,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: Array.map(faq.items, ({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        },
      ],
    })
  },
  component: Home,
})

function Home() {
  const { posts, total } = Route.useLoaderData()
  const mag = useRef<HTMLDivElement>(null)
  useLive(mag, loadMag, null)
  return (
    <main>
      <Sprite />
      <StorySprite />
      <Timelapse />
      <WaterCombo />
      <div className="mag" ref={mag}>
        <Story />
        <Bits />
        <Together />
        <Proof />
        <Pricing />
        <Faq />
        <LatestPosts posts={posts} total={total} />
        <CtaBand />
      </div>
    </main>
  )
}
