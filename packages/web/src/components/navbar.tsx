import { cn } from '@/lib/utils'

function LeafIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-6 w-6', className)}
      aria-hidden="true"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

export function Navbar() {
  return (
    <nav
      className="fixed top-0 right-0 left-0 z-50"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="glass-strong flex items-center justify-between rounded-2xl px-6 py-3">
          {/* Wordmark */}
          <a
            href="/"
            className="flex items-center gap-2"
            aria-label="Lily home"
          >
            <LeafIcon className="text-white" />
            <span className="text-xl font-bold text-white">Lily</span>
          </a>

          {/* Nav links */}
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              How it Works
            </a>
          </div>

          {/* CTA */}
          <a
            href="#download"
            className="glass rounded-full px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            Download
          </a>
        </div>
      </div>
    </nav>
  )
}
