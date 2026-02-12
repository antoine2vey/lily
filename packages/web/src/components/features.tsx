const features = [
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-primary"
        aria-hidden="true"
      >
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
    title: 'AI Plant ID',
    subtitle: 'Snap a photo, know your plant',
    description:
      'Point your camera at any plant and Lily identifies it instantly. Get species info, care ratings, and personalized tips in seconds.',
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-primary"
        aria-hidden="true"
      >
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M16 17H8" />
        <path d="M16 21H8" />
      </svg>
    ),
    title: 'Smart Reminders',
    subtitle: 'Care schedules that check the weather',
    description:
      'Lily adjusts your watering reminders when it rains. No more overwatering, no more guessing.',
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-primary"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>
    ),
    title: 'AI Care Chat',
    subtitle: 'A plant expert in your pocket',
    description:
      'Ask Lily anything about your plants. Upload a photo of yellowing leaves and get instant diagnosis and advice.',
  },
] as const

export function Features() {
  return (
    <section id="features" className="bg-white py-24 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl dark:text-white">
            Everything your plants need
          </h2>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-border bg-surface-tinted p-8 dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-tint dark:bg-primary/20">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-text-primary dark:text-white">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm font-medium text-primary">
                {feature.subtitle}
              </p>
              <p className="mt-3 text-text-secondary dark:text-neutral-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
