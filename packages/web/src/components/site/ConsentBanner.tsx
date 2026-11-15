import { Link } from '@tanstack/react-router'
import { Option } from 'effect'
import { useEffect, useRef } from 'react'
import { type Locale, messagesFor } from '@/i18n'
import { decide, useConsent } from '@/lib/consent'

const browserLocale = (): Locale =>
  navigator.language.startsWith('fr') ? 'fr' : 'en'

export function ConsentBanner({ locale }: { locale: Locale | undefined }) {
  const { asking, choice } = useConsent()
  const ref = useRef<HTMLElement>(null)
  const reopened = asking && Option.isSome(choice)

  useEffect(() => {
    if (reopened) ref.current?.focus()
  }, [reopened])

  if (!asking) return null
  const shown = locale ?? browserLocale()
  const m = messagesFor(shown).Consent
  return (
    <section
      ref={ref}
      tabIndex={-1}
      lang={shown}
      className="m-consent"
      aria-label={m.label}
    >
      <p>
        {m.body}{' '}
        <Link to="/$locale/privacy" params={{ locale: shown }}>
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
