import { createFileRoute } from '@tanstack/react-router'
import { Array } from 'effect'
import { DocPage, Section } from '@/components/site/Doc'
import { useI18n } from '@/i18n'
import { docHead } from '@/lib/page-seo'

export const Route = createFileRoute('/$locale/privacy')({
  head: ({ params }) => docHead(params.locale, 'Privacy', '/privacy'),
  component: Privacy,
})

function Privacy() {
  const { Privacy: t } = useI18n().m
  return (
    <DocPage title={t.heading} meta={t.lastUpdated} lead={t.intro}>
      {Array.map(t.sections, (section) => (
        <Section key={section.heading} section={section} />
      ))}
    </DocPage>
  )
}
