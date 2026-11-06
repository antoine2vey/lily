import { createFileRoute, Link } from '@tanstack/react-router'
import { Array } from 'effect'
import { DocPage, Section } from '@/components/site/Doc'
import { messagesFor, useI18n } from '@/i18n'
import { docHead } from '@/lib/page-seo'

const faqPage = (faqs: ReadonlyArray<{ q: string; a: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: Array.map(faqs, ({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
})

export const Route = createFileRoute('/$locale/support')({
  head: ({ params }) =>
    docHead(params.locale, 'Support', '/support', [
      faqPage(messagesFor(params.locale).Support.faqs),
    ]),
  component: Support,
})

function Support() {
  const { locale, m } = useI18n()
  const t = m.Support
  const link =
    'font-medium text-primary-dark underline-offset-2 hover:underline dark:text-primary'
  return (
    <DocPage title={t.heading} lead={t.intro}>
      <Section section={t.contact} />
      <section>
        <h2 className="mb-6 text-2xl font-bold tracking-tight text-ink">
          {t.faqHeading}
        </h2>
        <div className="divide-y divide-line rounded-3xl bg-surface ring-1 ring-line">
          {Array.map(t.faqs, ({ q, a }) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                {q}
                <span
                  className="text-xl text-primary transition-transform group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <Section section={t.account} />
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-ink">
          {t.linksHeading}
        </h2>
        <ul className="list-disc space-y-2 pl-6 marker:text-primary">
          <li>
            <Link to="/$locale/privacy" params={{ locale }} className={link}>
              {t.linkPrivacy}
            </Link>
          </li>
          <li>
            <Link to="/$locale/terms" params={{ locale }} className={link}>
              {t.linkTerms}
            </Link>
          </li>
          <li>
            <Link to="/$locale/blog" params={{ locale }} className={link}>
              {t.linkBlog}
            </Link>
          </li>
        </ul>
      </section>
    </DocPage>
  )
}
