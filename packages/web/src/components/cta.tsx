import { MeshGradient } from '@/components/mesh-gradient'

export function Cta() {
  return (
    <section id="download" className="relative py-24">
      <MeshGradient />

      <div className="relative z-10 mx-auto max-w-3xl px-6">
        <div className="glass-strong rounded-3xl px-8 py-16 text-center sm:px-16">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Start free. Grow forever.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/80">
            Unlimited plants, smart reminders, and AI features. No credit card
            needed.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#download"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-forest-green shadow-lg transition-transform hover:scale-105"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Free
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
