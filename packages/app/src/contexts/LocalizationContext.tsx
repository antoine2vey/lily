import type { LanguageCode } from '@lily/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Option, pipe } from 'effect'
import * as Linking from 'expo-linking'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from '@/i18n/types'
import { getDeviceLanguage } from '@/utils/notifications'

const E2E_LOCALE_QUERY_PARAM = 'e2e_locale'

const isValidLanguage = (lang: unknown): lang is LanguageCode =>
  lang === 'en' || lang === 'fr'

const extractE2ELocale = (url: string): Option.Option<LanguageCode> => {
  try {
    const value = Linking.parse(url).queryParams?.[E2E_LOCALE_QUERY_PARAM]
    return isValidLanguage(value) ? Option.some(value) : Option.none()
  } catch {
    return Option.none()
  }
}

interface LocalizationContextValue {
  /** Current language code */
  language: LanguageCode
  /** Update the language */
  setLanguage: (language: LanguageCode) => Promise<void>
  /** True while loading the stored preference */
  isLoading: boolean
  /** List of supported languages */
  supportedLanguages: typeof SUPPORTED_LANGUAGES
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null)

export function useLocalizationContext(): LocalizationContextValue {
  const context = useContext(LocalizationContext)
  if (!context) {
    throw new Error(
      'useLocalizationContext must be used within a LocalizationProvider'
    )
  }
  return context
}

interface LocalizationProviderProps {
  children: ReactNode
}

export function LocalizationProvider({ children }: LocalizationProviderProps) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [isLoading, setIsLoading] = useState(true)
  const { i18n: i18nInstance } = useTranslation()

  // Load stored preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)

        const resolvedLanguage = pipe(
          Option.fromNullable(stored),
          Option.filter(isValidLanguage),
          Option.getOrElse(getDeviceLanguage)
        )

        setLanguageState(resolvedLanguage)
        await i18nInstance.changeLanguage(resolvedLanguage)
      } catch {
        // Use device language on error
        const deviceLang = getDeviceLanguage()
        setLanguageState(deviceLang)
        await i18nInstance.changeLanguage(deviceLang)
      } finally {
        setIsLoading(false)
      }
    }

    loadPreference()
  }, [i18nInstance])

  const setLanguage = useCallback(
    async (newLanguage: LanguageCode) => {
      setLanguageState(newLanguage)
      await i18nInstance.changeLanguage(newLanguage)

      try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage)
      } catch {
        // Ignore storage errors
      }
    },
    [i18nInstance]
  )

  // Let Maestro / manual testing pin locale via deep link (e.g.
  // `lily://?e2e_locale=fr`). Persists like any user-selected locale.
  // Not __DEV__-gated: a malicious deep link would just flip the user's
  // UI language — same blast radius as the in-app language switcher —
  // and release-build screenshot pipelines also need this path to work.
  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url) return
      pipe(
        extractE2ELocale(url),
        Option.match({
          onNone: () => {},
          onSome: (lang) => {
            if (lang !== language) setLanguage(lang)
          },
        })
      )
    }

    Linking.getInitialURL().then(apply)
    const sub = Linking.addEventListener('url', ({ url }) => apply(url))
    return () => sub.remove()
  }, [setLanguage, language])

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      isLoading,
      supportedLanguages: SUPPORTED_LANGUAGES,
    }),
    [language, setLanguage, isLoading]
  )

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  )
}
