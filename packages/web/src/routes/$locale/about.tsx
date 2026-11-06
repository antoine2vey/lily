import { createFileRoute } from '@tanstack/react-router'
import { Array } from 'effect'
import { DocPage, Section } from '@/components/site/Doc'
import { StoreButtons } from '@/components/site/StoreButtons'
import { useI18n } from '@/i18n'
import { docHead } from '@/lib/page-seo'

export const Route = createFileRoute('/$locale/about')({
  head: ({ params }) => docHead(params.locale, 'About', '/about'),
  component: About,
})

function About() {
  const { About: t } = useI18n().m
  return (
    <DocPage title={t.introHeading} lead={t.introText}>
      {Array.map(t.sections, (section) => (
        <Section key={section.heading} section={section} />
      ))}
      <aside className="rounded-3xl bg-tint p-8 text-center dark:bg-surface">
        <h2 className="mb-3 text-2xl font-bold text-ink">{t.ctaHeading}</h2>
        <p className="mx-auto mb-6 max-w-md">{t.ctaText}</p>
        <div className="flex justify-center">
          <StoreButtons />
        </div>
      </aside>
    </DocPage>
  )
}
