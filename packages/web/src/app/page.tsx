import { Cta } from '@/components/cta'
import { Features } from '@/components/features'
import { Footer } from '@/components/footer'
import { Hero } from '@/components/hero'
import { HowItWorks } from '@/components/how-it-works'
import { MeshGradient } from '@/components/mesh-gradient'
import { Navbar } from '@/components/navbar'

export default function Home() {
  return (
    <main>
      {/* Hero section with mesh gradient background */}
      <div className="relative">
        <MeshGradient />
        <Navbar />
        <Hero />
      </div>

      <Features />
      <HowItWorks />
      <Cta />
      <Footer />
    </main>
  )
}
