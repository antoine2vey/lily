import AsyncStorage from '@react-native-async-storage/async-storage'
import { Option, pipe } from 'effect'
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
  type LanguageCode,
  SUPPORTED_LANGUAGES,
} from 'src/i18n/types'
import { getDeviceLanguage } from 'src/utils/notifications'

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

const isValidLanguage = (lang: string | null): lang is LanguageCode =>
  lang === 'en' || lang === 'fr'

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
