import { Link } from '@tanstack/react-router'
import { Option, String } from 'effect'
import { useEffect, useRef } from 'react'
import { type Locale, messagesFor } from '@/i18n'
import { decide, useConsent } from '@/lib/consent'

const browserLocale = (): Locale =>
  String.startsWith('fr')(navigator.language) ? 'fr' : 'en'

export function ConsentBanner({ locale }: { locale: Option.Option<Locale> }) {
  const { asking, choice } = useConsent()
  return asking ? (
    <Banner
      locale={Option.getOrElse(locale, browserLocale)}
      reopened={Option.isSome(choice)}
    />
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
