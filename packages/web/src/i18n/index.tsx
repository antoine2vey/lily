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

// How a page picks the language of its copy. `Locale` is a page under /en or /fr. `Prerendered` is a page outside a
// locale that is one file for every language, such as /join: it prerenders its copy once per locale and its head runs
// LANG_SCRIPT. `Hydrated` is any other page outside a locale, such as the redirect page /: it renders its copy once
// hydrated, in the browser language.
export type PageLanguage =
  | { readonly _tag: 'Locale'; readonly locale: Locale }
  | { readonly _tag: 'Prerendered' }
  | { readonly _tag: 'Hydrated' }

// Runs in the head of a `Prerendered` page before the first paint and writes the browser language to <html lang>. Each
// prerendered copy carries data-locale, and a rule in site.css shows only the copy that <html lang> names.
export const LANG_SCRIPT = `(function(){var l=(navigator.language||'').slice(0,2).toLowerCase();document.documentElement.lang=${JSON.stringify(locales)}.indexOf(l)<0?'${defaultLocale}':l})()`

// Reads the browser language the way LANG_SCRIPT does. Native string methods on purpose: see the Effect rule in
// packages/web/CLAUDE.md.
export const browserLocale = (): Locale => {
  const lang = navigator.language.slice(0, 2).toLowerCase()
  return isLocale(lang) ? lang : defaultLocale
}

const neverChanges = () => () => {}
export const useHydrated = () =>
  useSyncExternalStore(
    neverChanges,
    () => true,
    () => false
  )

// The locales a page renders its copy in, keyed by locale so React keeps the nodes that already painted. After
// hydration a page outside a locale renders only the browser language. Plain conditions, not Effect's Match: this file
// loads on every page, and Match adds about 1.4 KB gzipped to each.
export const usePageLocales = (page: PageLanguage): ReadonlyArray<Locale> => {
  const hydrated = useHydrated()
  if (page._tag === 'Locale') return [page.locale]
  if (hydrated) return [browserLocale()]
  return page._tag === 'Prerendered' ? locales : []
}

// The language <html lang> names. A page outside a locale prerenders the default, which LANG_SCRIPT overwrites on a
// `Prerendered` page.
export const usePageLocale = (page: PageLanguage): Locale => {
  const hydrated = useHydrated()
  if (page._tag === 'Locale') return page.locale
  return hydrated ? browserLocale() : defaultLocale
}
