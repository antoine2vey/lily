'use client'

import { Match, Option, String } from 'effect'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { AppleIcon, GooglePlayIcon, LilyMark } from '@/components/BrandIcons'
import type { Locale } from '@/i18n/routing'
import {
  appLink,
  fetchInviteView,
  type InviteView,
  invalid,
  loading,
  tokenFromPath,
} from '@/lib/canopy-invite'

const APP_STORE_URL = 'https://apps.apple.com/app/with-lily/id6758399014'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.lilyapp.app'

const STORE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 shadow-neu-sm bg-background text-lily-text px-6 py-3 rounded-full font-semibold hover:shadow-neu-inset transition-all duration-200'

interface Props {
  messages: Record<Locale, Record<string, string>>
}

export function JoinInvite({ messages }: Props) {
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
    <NextIntlClientProvider
      locale={locale}
      messages={{ Join: messages[locale] }}
      timeZone="UTC"
    >
      <main className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md shadow-neu-lg rounded-3xl p-8 sm:p-10 text-center">
          <a href="/" className="inline-flex mb-8" aria-label="Lily">
            <LilyMark size={56} />
          </a>
          <InviteCard view={view} token={token} />
        </div>
      </main>
    </NextIntlClientProvider>
  )
}

interface CardProps {
  view: InviteView
  token: Option.Option<string>
}

function InviteCard({ view, token }: CardProps) {
  const t = useTranslations('Join')

  return Match.value(view).pipe(
    Match.tag('Loading', () => (
      <div role="status" className="space-y-4 animate-pulse">
        <span className="sr-only">{t('loading')}</span>
        <div className="h-4 w-2/3 mx-auto rounded-full shadow-neu-inset-sm" />
        <div className="h-8 w-3/4 mx-auto rounded-full shadow-neu-inset-sm" />
        <div className="h-12 w-1/2 mx-auto mt-8 rounded-full shadow-neu-inset-sm" />
      </div>
    )),
    Match.tag('Ready', ({ preview }) => (
      <div>
        <p className="text-muted">
          {Option.match(Option.fromNullishOr(preview.inviterName), {
            onNone: () => t('invited'),
            onSome: (inviter) => t('invitedBy', { inviter }),
          })}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-lily-text break-words">
          {preview.canopyName}
        </h1>
        <p className="mt-4 text-sm text-muted">{t('canopyHint')}</p>
        {Option.match(token, {
          onNone: () => null,
          onSome: (value) => (
            <a
              href={appLink(value)}
              className="mt-8 inline-flex items-center justify-center w-full bg-primary hover:bg-primary-dark text-white px-6 py-4 rounded-full font-semibold transition-colors duration-200"
            >
              {t('openInLily')}
            </a>
          ),
        })}
        <div className="mt-10">
          <p className="font-semibold text-lily-text">{t('getTheApp')}</p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={STORE_BUTTON_CLASS}
            >
              <AppleIcon className="w-5 h-5" />
              {t('appStore')}
            </a>
            <a
              href={GOOGLE_PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={STORE_BUTTON_CLASS}
            >
              <GooglePlayIcon className="w-5 h-5" />
              {t('googlePlay')}
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">{t('tapAgain')}</p>
        </div>
      </div>
    )),
    Match.tag('Expired', () => (
      <Notice title={t('expiredTitle')} body={t('expiredBody')} />
    )),
    Match.tag('Invalid', () => (
      <Notice title={t('invalidTitle')} body={t('invalidBody')} />
    )),
    Match.tag('Unavailable', () => (
      <div>
        <Notice title={t('unavailableTitle')} body={t('unavailableBody')} />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${STORE_BUTTON_CLASS} mt-8`}
        >
          {t('retry')}
        </button>
      </div>
    )),
    Match.exhaustive
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-lily-text">{title}</h1>
      <p className="mt-4 text-muted">{body}</p>
    </div>
  )
}
