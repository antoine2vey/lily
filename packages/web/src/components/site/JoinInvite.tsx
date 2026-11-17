import { Array, Match, Option } from 'effect'
import { type ReactNode, useEffect, useState } from 'react'
import { fmt, messagesFor, usePageLocales } from '@/i18n'
import {
  appLink,
  fetchInviteView,
  type InvitePreview,
  type InviteView,
  invalid,
  loading,
  tokenFromPath,
} from '@/lib/canopy-invite'
import { appStoreUrl, PLAY_STORE_LIVE, PLAY_STORE_URL } from '@/lib/site'
import { AppleIcon, GooglePlayIcon, LilyMark } from './icons'

type JoinMessages = ReturnType<typeof messagesFor>['Join']

const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-full bg-surface px-6 py-3 font-semibold text-ink ring-1 ring-line transition-colors hover:bg-chip'

// The invite page is one static file for both languages. It prerenders the card in each, and the page shows the one
// in the browser language from the first paint, before the invite preview arrives.
export function JoinInvite() {
  const langs = usePageLocales(Option.none())
  const [token, setToken] = useState<Option.Option<string>>(Option.none())
  const [view, setView] = useState<InviteView>(loading)

  useEffect(() => {
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
    // The card hangs from a fixed top edge. Centering it moved it whenever the invite view changed its height.
    // The offset centers a 36rem card, the height of the invite preview. On a phone it centers a 46rem card instead,
    // so a long name or French copy still leaves the open button above the consent banner.
    <main className="flex min-h-screen items-start justify-center px-6 pt-[max(1.5rem,calc((100vh-46rem)/2))] pb-16 sm:pt-[max(4rem,calc((100vh-36rem)/2))]">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_20px_60px_-20px_rgb(0_0_0/0.18)] ring-1 ring-line sm:p-10">
        <a href="/" className="mb-8 inline-flex" aria-label="Lily">
          <LilyMark size={56} />
        </a>
        {Array.map(langs, (lang) => (
          <div key={lang} lang={lang} data-locale={lang}>
            <InviteCard view={view} token={token} t={messagesFor(lang).Join} />
          </div>
        ))}
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
  // The keys mount the invite preview as new nodes. A painted node that a longer name pushes down counts as a layout shift.
  return Match.value(view).pipe(
    Match.tag('Loading', () => (
      <Invite key="loading" preview={Option.none()} token={token} t={t} />
    )),
    Match.tag('Ready', ({ preview }) => (
      <Invite key="ready" preview={Option.some(preview)} token={token} t={t} />
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

// The copy that does not depend on the invite is in the prerender. Until the preview lands, each slot it fills holds
// a bar with the box of the element that replaces it, so the card keeps its height.
function Invite({
  preview,
  token,
  t,
}: {
  preview: Option.Option<InvitePreview>
  token: Option.Option<string>
  t: JoinMessages
}) {
  return (
    <div>
      {Option.match(preview, {
        onNone: () => (
          <Bar slot="h-6" bar="h-4 w-2/3" role="status">
            <span className="sr-only">{t.loading}</span>
          </Bar>
        ),
        onSome: ({ inviterName }) => (
          <p className="break-words text-ink-2">
            {Option.match(Option.fromNullishOr(inviterName), {
              onNone: () => t.invited,
              onSome: (inviter) => fmt(t.invitedBy, { inviter }),
            })}
          </p>
        ),
      })}
      {Option.match(preview, {
        onNone: () => <Bar slot="mt-2 h-9" bar="h-7 w-3/4" />,
        onSome: ({ canopyName }) => (
          <h1 className="mt-2 text-3xl font-bold break-words text-ink">
            {canopyName}
          </h1>
        ),
      })}
      <p className="mt-4 text-sm text-muted">{t.canopyHint}</p>
      {Option.match(
        Option.zipWith(preview, token, (_, value) => value),
        {
          onNone: () => (
            <div className="mt-8 h-14 animate-pulse rounded-full bg-chip" />
          ),
          onSome: (value) => (
            <a
              href={appLink(value)}
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-4 font-semibold text-on-primary transition-colors hover:bg-primary-dark"
            >
              {t.openInLily}
            </a>
          ),
        }
      )}
      <div className="mt-10">
        <p className="font-semibold text-ink">{t.getTheApp}</p>
        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={appStoreUrl('web-join')}
            target="_blank"
            rel="noopener noreferrer"
            className={SECONDARY}
          >
            <AppleIcon className="size-5" />
            {t.appStore}
          </a>
          {PLAY_STORE_LIVE && (
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={SECONDARY}
            >
              <GooglePlayIcon className="size-5" />
              {t.googlePlay}
            </a>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">{t.tapAgain}</p>
      </div>
    </div>
  )
}

function Bar({
  slot,
  bar,
  role,
  children,
}: {
  slot: string
  bar: string
  role?: 'status'
  children?: ReactNode
}) {
  return (
    <div role={role} className={`flex items-center justify-center ${slot}`}>
      {children}
      <div className={`animate-pulse rounded-full bg-chip ${bar}`} />
    </div>
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
