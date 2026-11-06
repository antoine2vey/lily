import { createFileRoute } from '@tanstack/react-router'
import { Array, Record } from 'effect'
import { DocPage, Section } from '@/components/site/Doc'
import { messagesFor, useI18n } from '@/i18n'
import { author, authorJsonLd } from '@/lib/authors'
import { docHead } from '@/lib/page-seo'

export const Route = createFileRoute('/$locale/team')({
  head: ({ params: { locale } }) =>
    docHead(locale, 'Team', '/team', [
      authorJsonLd(locale, messagesFor(locale).Team.role),
    ]),
  component: Team,
})

function Team() {
  const { Team: t } = useI18n().m
  return (
    <DocPage title={t.heading} lead={t.lead}>
      <section>
        <h2 className="text-2xl font-bold tracking-tight text-ink">{t.name}</h2>
        <p className="mt-1 text-muted">{t.role}</p>
      </section>
      {Array.map(t.sections, (section) => (
        <Section key={section.heading} section={section} />
      ))}
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-ink">
          {t.linksHeading}
        </h2>
        <ul className="flex flex-wrap gap-3">
          {Array.map(Record.toEntries(t.links), ([key, label]) => (
            <li key={key}>
              <a
                href={author[key]}
                rel="me noopener"
                className="inline-flex rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:-translate-y-0.5"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </DocPage>
  )
}
