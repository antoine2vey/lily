import { Link } from '@tanstack/react-router'
import { Array, Option } from 'effect'
import { useEffect, useRef } from 'react'
import {
  browserLocale,
  type Locale,
  messagesFor,
  useHydrated,
  usePageLocales,
} from '@/i18n'
import { askAgain, decide, useConsent } from '@/lib/consent'

export function ConsentBanner({ locale }: { locale: Option.Option<Locale> }) {
  const { asking, choice } = useConsent()
  const hydrated = useHydrated()
  const langs = usePageLocales(locale)
  return asking
    ? Array.map(langs, (lang) => (
        <Banner
          key={lang}
          locale={lang}
          live={hydrated}
          reopened={Option.isSome(choice)}
        />
      ))
    : null
}

// A page outside a locale has no footer, so the root route gives it this way back to the banner.
export function ConsentSettings() {
  return useHydrated() ? (
    <p className="m-consent-settings">
      <button type="button" onClick={askAgain}>
        {messagesFor(browserLocale()).Consent.settings}
      </button>
    </p>
  ) : null
}

function Banner({
  locale,
  live,
  reopened,
}: {
  locale: Locale
  live: boolean
  reopened: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const m = messagesFor(locale).Consent

  useEffect(() => {
    if (reopened) ref.current?.focus()
  }, [reopened])

  // Only the live banner reserves its space: a prerendered copy in the other language unmounts at hydration.
  useEffect(() => {
    const banner = ref.current
    if (!live || banner === null) return undefined
    const root = document.documentElement
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--consent-space', `${banner.offsetHeight + 32}px`)
    )
    observer.observe(banner)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--consent-space')
    }
  }, [live])

  return (
    <section
      ref={ref}
      tabIndex={-1}
      lang={locale}
      className="m-consent"
      data-live={live || undefined}
      data-locale={locale}
      aria-label={m.label}
    >
      <p>
        {m.body}{' '}
        <Link to="/$locale/privacy" params={{ locale }}>
          {m.policy}
        </Link>
      </p>
      <div className="m-consent-actions">
        <button type="button" onClick={() => decide('denied')}>
          {m.refuse}
        </button>
        <button type="button" onClick={() => decide('granted')}>
          {m.accept}
        </button>
      </div>
    </section>
  )
}
