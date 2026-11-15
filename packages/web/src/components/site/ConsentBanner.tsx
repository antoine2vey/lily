import { Link } from '@tanstack/react-router'
import { Option } from 'effect'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { type Locale, messagesFor } from '@/i18n'
import { askAgain, decide, useConsent } from '@/lib/consent'

// Native string methods on purpose: see the Effect rule in packages/web/CLAUDE.md.
const browserLocale = (): Locale =>
  navigator.language.startsWith('fr') ? 'fr' : 'en'

export function ConsentBanner({ locale }: { locale: Option.Option<Locale> }) {
  const { asking, choice } = useConsent()
  return asking ? (
    <Banner
      locale={Option.getOrElse(locale, browserLocale)}
      reopened={Option.isSome(choice)}
    />
  ) : null
}

const neverChanges = () => () => {}
const useHydrated = () =>
  useSyncExternalStore(
    neverChanges,
    () => true,
    () => false
  )

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

function Banner({ locale, reopened }: { locale: Locale; reopened: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const m = messagesFor(locale).Consent

  useEffect(() => {
    if (reopened) ref.current?.focus()
  }, [reopened])

  useEffect(() => {
    const banner = ref.current
    if (banner === null) return undefined
    const root = document.documentElement
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--consent-space', `${banner.offsetHeight + 32}px`)
    )
    observer.observe(banner)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--consent-space')
    }
  }, [])

  return (
    <section
      ref={ref}
      tabIndex={-1}
      lang={locale}
      className="m-consent"
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
