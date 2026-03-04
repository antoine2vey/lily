import { Array, pipe } from 'effect'
import dynamic from 'next/dynamic'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { JsonLd } from '@/components/JsonLd'
import { LatestPosts } from '@/components/LatestPosts'

const StatsBar = dynamic(() =>
  import('@/components/StatsBar').then((m) => m.StatsBar)
)
const Features = dynamic(() =>
  import('@/components/Features').then((m) => m.Features)
)
const Testimonials = dynamic(() =>
  import('@/components/Testimonials').then((m) => m.Testimonials)
)
const FAQ = dynamic(() => import('@/components/FAQ').then((m) => m.FAQ))
const Pricing = dynamic(() =>
  import('@/components/Pricing').then((m) => m.Pricing)
)
const Footer = dynamic(() =>
  import('@/components/Footer').then((m) => m.Footer)
)

interface Props {
  params: Promise<{ locale: string }>
}

export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'FAQ' })

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pipe(
      Array.range(0, 5),
      Array.map((i) => ({
        '@type': 'Question',
        name: t(`q${i}`),
        acceptedAnswer: { '@type': 'Answer', text: t(`a${i}`) },
      }))
    ),
  }

  return (
    <main className="pb-20 md:pb-0">
      <JsonLd data={faqSchema} />
      <Header />
      <Hero />
      <StatsBar />
      <Features />
      <Testimonials />
      <FAQ />
      <Pricing />
      <LatestPosts />
      <Footer />
    </main>
  )
}
