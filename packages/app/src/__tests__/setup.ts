import '@testing-library/jest-native/extend-expect'

// Import all module mocks
import './mocks/expo-modules'
import './mocks/navigation'

// Import QueryClient cleanup utility
import { cleanupQueryClients } from './utils/query-helpers'

// Mock react-i18next globally for all components
// This creates a simple mock that returns translations from the actual translation files
jest.mock('react-i18next', () => {
  // Import translations inside the mock factory
  const en = require('../i18n/locales/en').default

  const getTranslationValue = (
    namespace: string,
    keyPath: string,
    options?: Record<string, unknown>
  ): string => {
    // Get the namespace object
    const namespaceObj = en[namespace]
    if (!namespaceObj) return keyPath

    // Navigate the path
    const parts = keyPath.split('.')
    let current: unknown = namespaceObj
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return keyPath // Key not found, return original key path
      }
    }

    // Return the string value or the key if not a string
    if (typeof current === 'string') {
      // Handle interpolation
      if (options) {
        let result = current
        for (const [optKey, optValue] of Object.entries(options)) {
          result = result.replace(
            new RegExp(`\\{${optKey}\\}`, 'g'),
            String(optValue)
          )
        }
        return result
      }
      return current
    }
    return keyPath
  }

  return {
    useTranslation: (namespaces?: string | string[]) => {
      // Get the default namespace from the parameter
      const defaultNs =
        (Array.isArray(namespaces) ? namespaces[0] : namespaces) || 'common'

      const t = (key: string, options?: Record<string, unknown>): string => {
        // Handle explicit namespaced keys like 'plantDetail:edit.title'
        const colonIndex = key.indexOf(':')
        if (colonIndex > -1) {
          const namespace = key.substring(0, colonIndex)
          const keyPath = key.substring(colonIndex + 1)
          return getTranslationValue(namespace, keyPath, options)
        }
        // Use the default namespace from useTranslation
        return getTranslationValue(defaultNs, key, options)
      }

      // Create a t function that can handle namespace in options
      const i18nT = (
        key: string,
        options?: Record<string, unknown>
      ): string => {
        // Handle namespace in options like i18n.t('key', { ns: 'namespace' })
        const ns = typeof options?.ns === 'string' ? options.ns : defaultNs
        const colonIndex = key.indexOf(':')
        if (colonIndex > -1) {
          const namespace = key.substring(0, colonIndex)
          const keyPath = key.substring(colonIndex + 1)
          return getTranslationValue(namespace, keyPath, options)
        }
        return getTranslationValue(ns, key, options)
      }

      return {
        t,
        i18n: {
          language: 'en',
          changeLanguage: jest.fn().mockResolvedValue(undefined),
          t: i18nT,
        },
      }
    },
    Trans: ({ children }: { children: React.ReactNode }) => children,
    initReactI18next: {
      type: '3rdParty',
      init: jest.fn(),
    },
  }
})

// Mock @sentry/react-native globally. Its ESM build lives under a nested
// node_modules path that Jest's transformIgnorePatterns doesn't transpile,
// so any module importing it (e.g. @/utils/linking, @/hooks/useOTAUpdates)
// would otherwise fail to load with "unexpected token".
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  wrap: (component: unknown) => component,
}))

// Note: @expo/vector-icons is mocked via __mocks__/@expo/vector-icons.js
// to avoid act() warnings from async font loading

// Mock ThemeContext globally to avoid "must be used within ThemeProvider" errors
jest.mock('@/contexts/ThemeContext', () => ({
  useThemeContext: () => ({
    preference: 'light' as const,
    resolvedTheme: 'light' as const,
    isDark: false,
    setTheme: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock LocalizationContext globally to avoid "must be used within LocalizationProvider" errors
jest.mock('@/contexts/LocalizationContext', () => ({
  useLocalizationContext: () => ({
    language: 'en' as const,
    setLanguage: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    supportedLanguages: [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
    ],
  }),
  LocalizationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))

// Mock useLocalization hook globally
jest.mock('@/hooks/useLocalization', () => {
  // Import translations inside the mock factory
  const en = require('../i18n/locales/en').default

  const getTranslationValue = (
    namespace: string,
    keyPath: string,
    options?: Record<string, unknown>
  ): string => {
    const namespaceObj = en[namespace]
    if (!namespaceObj) return `${namespace}:${keyPath}`

    const parts = keyPath.split('.')
    let current: unknown = namespaceObj
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return `${namespace}:${keyPath}`
      }
    }

    if (typeof current === 'string') {
      if (options) {
        let result = current
        for (const [optKey, optValue] of Object.entries(options)) {
          result = result.replace(
            new RegExp(`\\{${optKey}\\}`, 'g'),
            String(optValue)
          )
        }
        return result
      }
      return current
    }
    return `${namespace}:${keyPath}`
  }

  return {
    useLocalization: () => ({
      t: (key: string, options?: Record<string, unknown>): string => {
        const colonIndex = key.indexOf(':')
        if (colonIndex > -1) {
          const namespace = key.substring(0, colonIndex)
          const keyPath = key.substring(colonIndex + 1)
          return getTranslationValue(namespace, keyPath, options)
        }
        return key
      },
      language: 'en' as const,
      setLanguage: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
      supportedLanguages: [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'fr', name: 'French', nativeName: 'Français' },
      ],
    }),
  }
})

// Clean up QueryClients after each test to prevent open handles
afterEach(() => {
  cleanupQueryClients()
})

// Suppress known React testing warnings that are false positives
// These occur with VirtualizedList and TanStack Query internal async updates
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  const message = args[0]
  if (
    typeof message === 'string' &&
    (message.includes('inside a test was not wrapped in act') ||
      message.includes('Each child in a list should have a unique "key" prop'))
  ) {
    return
  }
  originalConsoleError(...args)
}

// Mock safe area context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 }
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  }
})

// Mock theme
jest.mock('@/theme', () => ({
  iconColorsLight: {
    primary: '#80ac53',
    primaryDark: '#6a9145',
    muted: '#9CA3AF',
    white: '#FFFFFF',
    error: '#EF4444',
    warning: '#F59E0B',
    success: '#80ac53',
    waterBlue: '#60A5FA',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate900: '#0f172a',
    coral: '#E8997E',
    fertilizerOrange: '#F59E0B',
    mistTeal: '#5EEAD4',
    pruneRed: '#F87171',
    border: '#E5E7EB',
    textPrimary: '#1A1A1A',
    textMuted: '#9CA3AF',
    textSecondary: '#4A5568',
    achievementGold: '#FCD34D',
    surfaceTinted: '#F0F5F0',
    info: '#3B82F6',
    background: '#F8FAF8',
  },
  iconColorsDark: {
    primary: '#9bc76d',
    primaryDark: '#80ac53',
    muted: '#6B7280',
    white: '#FFFFFF',
    error: '#F87171',
    warning: '#FBBF24',
    success: '#9bc76d',
    waterBlue: '#93C5FD',
    slate400: '#94a3b8',
    slate500: '#94a3b8',
    slate900: '#F8FAFC',
    coral: '#F5B89A',
    fertilizerOrange: '#FBBF24',
    repotBrown: '#C4A882',
    mistTeal: '#99F6E4',
    pruneRed: '#FCA5A5',
    border: '#374151',
    textPrimary: '#FFFFFF',
    textMuted: '#9CA3AF',
    textSecondary: '#D1D5DB',
    achievementGold: '#FDE68A',
    surfaceTinted: '#2D3728',
    info: '#60A5FA',
    background: '#1A1A1A',
  },
  fonts: {
    regular: 'SpaceGrotesk_400Regular',
    medium: 'SpaceGrotesk_500Medium',
    semiBold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
    extraBold: 'SpaceGrotesk_700Bold',
  },
}))
