import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type React from 'react'

// Unmock the module for these specific tests since we want to test the real implementation
jest.unmock('src/contexts/LocalizationContext')
jest.unmock('src/hooks/useLocalization')

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}))

// Mock i18n
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    changeLanguage: jest.fn().mockResolvedValue(undefined),
    language: 'en',
  },
}))

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: jest.fn().mockResolvedValue(undefined),
      language: 'en',
    },
  }),
}))

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}))

import * as Localization from 'expo-localization'
import {
  LocalizationProvider,
  useLocalizationContext,
} from '../LocalizationContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocalizationProvider>{children}</LocalizationProvider>
)

describe('LocalizationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    ;(Localization.getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en' },
    ])
  })

  describe('useLocalizationContext hook', () => {
    it('throws when used outside provider', () => {
      expect(() => {
        renderHook(() => useLocalizationContext())
      }).toThrow(
        'useLocalizationContext must be used within a LocalizationProvider'
      )
    })

    it('provides language state', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBeDefined()
      expect(['en', 'fr']).toContain(result.current.language)
    })

    it('provides setLanguage function', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.setLanguage).toBe('function')
    })

    it('provides supportedLanguages array', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.supportedLanguages).toBeDefined()
      expect(Array.isArray(result.current.supportedLanguages)).toBe(true)
      expect(result.current.supportedLanguages.length).toBe(2)
    })

    it('provides isLoading state', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      // Initially might be loading
      expect(typeof result.current.isLoading).toBe('boolean')

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('LocalizationProvider', () => {
    it('renders children', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current).toBeTruthy()
    })

    it('defaults to English when no stored preference', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBe('en')
    })

    it('loads stored language preference', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('fr')

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBe('fr')
    })

    it('ignores invalid stored language', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid')

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should fall back to device language or default
      expect(['en', 'fr']).toContain(result.current.language)
    })

    it('uses device language when storage fails', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      )

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBe('en')
    })

    it('detects French device locale', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
      ;(Localization.getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'fr' },
      ])

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBe('fr')
    })

    it('falls back to English for unsupported device locale', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
      ;(Localization.getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'de' },
      ])

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.language).toBe('en')
    })
  })

  describe('setLanguage function', () => {
    it('is callable and returns a promise', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // setLanguage should be a function that returns a promise
      const setLanguageResult = result.current.setLanguage('fr')
      expect(setLanguageResult).toBeInstanceOf(Promise)
    })

    it('calls AsyncStorage.setItem when language is changed', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.setLanguage('fr')
      })

      // Verify AsyncStorage was called (even if state update is complex to verify)
      expect(AsyncStorage.setItem).toHaveBeenCalled()
    })

    it('does not throw when AsyncStorage fails', async () => {
      ;(AsyncStorage.setItem as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      )

      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should not throw even when storage fails
      await expect(
        act(async () => {
          await result.current.setLanguage('fr')
        })
      ).resolves.not.toThrow()
    })
  })

  describe('supportedLanguages', () => {
    it('contains English', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const english = result.current.supportedLanguages.find(
        (l) => l.code === 'en'
      )
      expect(english).toBeDefined()
      expect(english?.name).toBe('English')
      expect(english?.nativeName).toBe('English')
    })

    it('contains French', async () => {
      const { result } = renderHook(() => useLocalizationContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const french = result.current.supportedLanguages.find(
        (l) => l.code === 'fr'
      )
      expect(french).toBeDefined()
      expect(french?.name).toBe('French')
      expect(french?.nativeName).toBe('Français')
    })
  })
})
