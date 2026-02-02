import type { ParseKeys } from 'i18next'
import type en from './locales/en'

export type LanguageCode = 'en' | 'fr'

export type LocalizationState =
  | { _tag: 'Loading' }
  | { _tag: 'Ready'; language: LanguageCode }

export type TranslationResources = typeof en

// Type-safe translation keys
export type TranslationKey = ParseKeys<
  'common' | 'auth' | 'home' | 'plants' | 'care' | 'settings'
>

export const SUPPORTED_LANGUAGES: ReadonlyArray<{
  code: LanguageCode
  name: string
  nativeName: string
}> = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export const LANGUAGE_STORAGE_KEY = 'lily_language_preference'
