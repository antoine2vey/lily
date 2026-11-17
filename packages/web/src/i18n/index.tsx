import { Array, Option, pipe, Record } from 'effect'
import { createContext, type ReactNode, use, useSyncExternalStore } from 'react'
import { en, type Messages } from './en'
import { fr } from './fr'

export const locales = ['en', 'fr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const isLocale = (s: string): s is Locale => Array.contains(locales, s)

const catalogs: Record<Locale, Messages> = { en, fr }
export const messagesFor = (locale: Locale): Messages => catalogs[locale]

export const fmt = (
  template: string,
  vars: Record<string, string | number>
): string =>
  template.replace(/\{(\w+)\}/g, (raw, key: string) =>
    pipe(
      Record.get(vars, key),
      Option.match({ onNone: () => raw, onSome: String })
    )
  )

export interface PluralForms {
  readonly zero?: string
  readonly one: string
  readonly other: string
}

export const plural = (
  locale: Locale,
  count: number,
  forms: PluralForms
): string =>
  fmt(
    count === 0 && forms.zero !== undefined
      ? forms.zero
      : new Intl.PluralRules(locale).select(count) === 'one'
        ? forms.one
        : forms.other,
    { count }
  )

interface I18n {
  readonly locale: Locale
  readonly m: Messages
}

const I18nContext = createContext<I18n>({ locale: defaultLocale, m: en })

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  return (
    <I18nContext value={{ locale, m: messagesFor(locale) }}>
      {children}
    </I18nContext>
  )
}

export const useI18n = (): I18n => use(I18nContext)

// A page outside a locale, such as /join, is one prerendered file for every language. This script runs in its head
// before the first paint and writes the browser language to <html lang>. The page prerenders its copy once per locale,
// each copy marked with data-locale, and a rule in site.css shows only the copy that <html lang> names.
export const LANG_SCRIPT = `(function(){var l=(navigator.language||'').slice(0,2).toLowerCase();document.documentElement.lang=${JSON.stringify(locales)}.indexOf(l)<0?'${defaultLocale}':l})()`

const neverChanges = () => () => {}
export const useHydrated = () =>
  useSyncExternalStore(
    neverChanges,
    () => true,
    () => false
  )

// The language LANG_SCRIPT picked for a page outside a locale.
export const browserLocale = (): Locale => {
  const { lang } = document.documentElement
  return isLocale(lang) ? lang : defaultLocale
}

// The locales a page renders its copy in. Before hydration, a page outside a locale renders every one, as its prerender
// did. After it renders only the one on screen, keyed by locale so React keeps the nodes that already painted.
export const usePageLocales = (
  locale: Option.Option<Locale>
): ReadonlyArray<Locale> => {
  const hydrated = useHydrated()
  return Option.match(locale, {
    onSome: (known) => [known],
    onNone: () => (hydrated ? [browserLocale()] : locales),
  })
}
