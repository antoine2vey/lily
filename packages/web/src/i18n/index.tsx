import { Array, Option, pipe, Record } from 'effect'
import { createContext, type ReactNode, use } from 'react'
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
