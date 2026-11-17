import { createFileRoute, Link } from '@tanstack/react-router'
import { Array, Option, pipe } from 'effect'
import { Calculator } from '@/components/calculator/Calculator'
import { StoreButtons } from '@/components/site/StoreButtons'
import { type Locale, useI18n } from '@/i18n'
import { breadcrumbs, localeUrl, seo } from '@/lib/seo'

const PATH = '/watering-calculator'

const READ_NEXT = [
  'how-often-to-water-houseplants',
  'houseplant-light-guide',
  'overwatering-vs-underwatering',
  'how-to-water-plants-while-on-vacation',
] as const

const webApplication = (locale: Locale, name: string, description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name,
  description,
  url: localeUrl(locale, PATH),
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  inLanguage: locale,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
})

export const Route = createFileRoute('/$locale/watering-calculator')({
  loader: async ({ params }) => {
    const [{ calculatorMessages }, { postIndex }] = await Promise.all([
      import('@/i18n/calculator'),
      import('@/lib/post-data'),
    ])
    const index = await postIndex(params.locale)
    // A renamed hub fails the prerender here instead of dropping a link.
    const reads = Array.map(READ_NEXT, (slug) =>
      pipe(
        Array.findFirst(index, (post) => post.slug === slug),
        Option.map((post) => ({ slug, title: post.title })),
        Option.getOrThrowWith(
          () => new Error(`No ${params.locale} post with slug ${slug}`)
        )
      )
    )
    return { t: calculatorMessages[params.locale], reads }
  },
  head: ({ params: { locale }, loaderData }) => {
    if (!loaderData) return {}
    const { meta } = loaderData.t
    return seo({
      locale,
      path: PATH,
      title: meta.title,
      description: meta.description,
      imageAlt: meta.appName,
      jsonLd: [
        breadcrumbs(locale, [
          ['Lily', ''],
          [meta.breadcrumb, PATH],
        ]),
        webApplication(locale, meta.appName, meta.description),
      ],
    })
  },
  component: CalculatorPage,
})

const link =
  'font-semibold text-primary-dark underline-offset-2 hover:underline dark:text-primary'

function CalculatorPage() {
  const { t, reads } = Route.useLoaderData()
  const { locale } = useI18n()
  return (
    <main className="px-4 pt-28 pb-24 sm:px-5 sm:pt-32">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t.heading}
        </h1>
        <p className="mb-8 max-w-2xl text-lg leading-relaxed text-ink-2">
          {t.lead}
        </p>

        <Calculator t={t} />

        <div className="mx-auto mt-16 max-w-3xl space-y-12 leading-relaxed text-ink-2">
          <section>
            <h2 className="mb-4 text-2xl font-bold tracking-tight text-ink">
              {t.how.heading}
            </h2>
            <p>{t.how.intro}</p>
            <dl className="mt-6 space-y-5">
              {Array.map(t.how.items, (item) => (
                <div key={item.title}>
                  <dt className="font-semibold text-ink">{item.title}</dt>
                  <dd className="mt-1">{item.body}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6">{t.how.outro}</p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold tracking-tight text-ink">
              {t.limits.heading}
            </h2>
            <p>{t.limits.body}</p>
            <p className="mt-4 font-semibold text-ink">{t.limits.checkSoil}</p>
            <Link
              to="/$locale/blog/$slug"
              params={{ locale, slug: 'how-often-to-water-houseplants' }}
              className={`mt-2 inline-block ${link}`}
            >
              {t.limits.checkSoilLink}
            </Link>
          </section>

          <aside className="rounded-3xl bg-tint p-8 text-center dark:bg-surface">
            <h2 className="mb-3 text-2xl font-bold text-ink">
              {t.aside.heading}
            </h2>
            <p className="mx-auto mb-6 max-w-md">{t.aside.body}</p>
            <div className="flex justify-center">
              <StoreButtons kind="tool" />
            </div>
          </aside>

          <nav aria-labelledby="calc-read-next">
            <h2
              id="calc-read-next"
              className="mb-4 text-2xl font-bold tracking-tight text-ink"
            >
              {t.read.heading}
            </h2>
            <ul className="space-y-3">
              {Array.map(reads, ({ slug, title }) => (
                <li key={slug}>
                  <Link
                    to="/$locale/blog/$slug"
                    params={{ locale, slug }}
                    className={link}
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  )
}
