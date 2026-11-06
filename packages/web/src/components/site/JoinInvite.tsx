import { Match, Option, String } from 'effect'
import { useEffect, useState } from 'react'
import { fmt, type Locale, messagesFor } from '@/i18n'
import {
  appLink,
  fetchInviteView,
  type InviteView,
  invalid,
  loading,
  tokenFromPath,
} from '@/lib/canopy-invite'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site'
import { AppleIcon, GooglePlayIcon, LilyMark } from './icons'

type JoinMessages = ReturnType<typeof messagesFor>['Join']

const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-full bg-surface px-6 py-3 font-semibold text-ink ring-1 ring-line transition-colors hover:bg-chip'

// The invite page is one static file for both languages, so the locale comes from the browser.
export function JoinInvite() {
  const [locale, setLocale] = useState<Locale>('en')
  const [token, setToken] = useState<Option.Option<string>>(Option.none())
  const [view, setView] = useState<InviteView>(loading)

  useEffect(() => {
    const detected: Locale = String.startsWith('fr')(navigator.language)
      ? 'fr'
      : 'en'
    document.documentElement.lang = detected
    setLocale(detected)
    const parsed = tokenFromPath(window.location.pathname)
    setToken(parsed)
    if (Option.isNone(parsed)) {
      setView(invalid)
      return
    }
    const controller = new AbortController()
    fetchInviteView(parsed.value, controller.signal).then((next) => {
      if (!controller.signal.aborted) setView(next)
    })
    return () => controller.abort()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_20px_60px_-20px_rgb(0_0_0/0.18)] ring-1 ring-line sm:p-10">
        <a href="/" className="mb-8 inline-flex" aria-label="Lily">
          <LilyMark size={56} />
        </a>
        <InviteCard view={view} token={token} t={messagesFor(locale).Join} />
      </div>
    </main>
  )
}

function InviteCard({
  view,
  token,
  t,
}: {
  view: InviteView
  token: Option.Option<string>
  t: JoinMessages
}) {
  return Match.value(view).pipe(
    Match.tag('Loading', () => (
      <div role="status" className="animate-pulse space-y-4">
        <span className="sr-only">{t.loading}</span>
        <div className="mx-auto h-4 w-2/3 rounded-full bg-chip" />
        <div className="mx-auto h-8 w-3/4 rounded-full bg-chip" />
        <div className="mx-auto mt-8 h-12 w-1/2 rounded-full bg-chip" />
      </div>
    )),
    Match.tag('Ready', ({ preview }) => (
      <div>
        <p className="text-ink-2">
          {Option.match(Option.fromNullishOr(preview.inviterName), {
            onNone: () => t.invited,
            onSome: (inviter) => fmt(t.invitedBy, { inviter }),
          })}
        </p>
        <h1 className="mt-2 text-3xl font-bold break-words text-ink">
          {preview.canopyName}
        </h1>
        <p className="mt-4 text-sm text-muted">{t.canopyHint}</p>
        {Option.match(token, {
          onNone: () => null,
          onSome: (value) => (
            <a
              href={appLink(value)}
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-4 font-semibold text-on-primary transition-colors hover:bg-primary-dark"
            >
              {t.openInLily}
            </a>
          ),
        })}
        <div className="mt-10">
          <p className="font-semibold text-ink">{t.getTheApp}</p>
          <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SECONDARY}
            >
              <AppleIcon className="size-5" />
              {t.appStore}
            </a>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SECONDARY}
            >
              <GooglePlayIcon className="size-5" />
              {t.googlePlay}
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">{t.tapAgain}</p>
        </div>
      </div>
    )),
    Match.tag('Expired', () => (
      <Notice title={t.expiredTitle} body={t.expiredBody} />
    )),
    Match.tag('Invalid', () => (
      <Notice title={t.invalidTitle} body={t.invalidBody} />
    )),
    Match.tag('Unavailable', () => (
      <div>
        <Notice title={t.unavailableTitle} body={t.unavailableBody} />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${SECONDARY} mt-8`}
        >
          {t.retry}
        </button>
      </div>
    )),
    Match.exhaustive
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-4 text-ink-2">{body}</p>
    </div>
  )
}
