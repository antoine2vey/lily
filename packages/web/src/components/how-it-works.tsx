const steps = [
  {
    number: '1',
    title: 'Add your plants',
    description:
      'Scan a nursery tag, snap a photo for AI identification, or add manually.',
  },
  {
    number: '2',
    title: 'Set it and forget it',
    description:
      'Lily creates a care schedule and sends smart reminders adapted to your weather.',
  },
  {
    number: '3',
    title: 'Watch them thrive',
    description:
      'Track growth with photos, earn achievements, and become the plant parent you always wanted to be.',
  },
] as const

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-surface-tinted py-24 dark:bg-neutral-900"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-text-primary sm:text-4xl dark:text-white">
            Get growing in 3 steps
          </h2>
        </div>

        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-white">
                {step.number}
              </div>
              <h3 className="mt-6 text-xl font-bold text-text-primary dark:text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-text-secondary dark:text-neutral-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
