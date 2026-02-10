import i18n from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'

import en from './locales/en'
import fr from './locales/fr'
import { DEFAULT_LANGUAGE } from './types'

export const resources = {
  en,
  fr,
} as const

export const defaultNS = 'common'

i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS,
    ns: [
      'common',
      'auth',
      'home',
      'plants',
      'care',
      'settings',
      'profile',
      'rooms',
      'about',
      'onboarding',
      'achievements',
      'subscription',
      'addPlant',
      'plantDetail',
      'logCare',
      'notifications',
    ],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

export default i18n

// Re-export types
export * from './types'
