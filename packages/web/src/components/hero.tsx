export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
          Your plants, thriving
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80 sm:text-xl">
          The smart plant care companion that remembers when you forget.
          AI-powered identification, weather-aware reminders, and expert advice
          — all in your pocket.
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
          <a
            href="#features"
            className="glass inline-flex rounded-full px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/20"
          >
            Learn More
          </a>
        </div>
      </div>
    </section>
  )
}
