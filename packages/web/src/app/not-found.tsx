import { MeshGradient } from '@/components/mesh-gradient'

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center">
      <MeshGradient />
      <div className="relative z-10 text-center">
        <h1 className="text-6xl font-bold text-white">404</h1>
        <p className="mt-4 text-lg text-white/80">This page has wilted away.</p>
        <a
          href="/"
          className="mt-8 inline-flex rounded-full bg-white px-8 py-4 text-base font-semibold text-forest-green shadow-lg transition-transform hover:scale-105"
        >
          Back to Home
        </a>
      </div>
    </main>
  )
}
