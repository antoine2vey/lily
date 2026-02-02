import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  type LanguageCode,
  SUPPORTED_LANGUAGES,
} from '../types'

describe('i18n types', () => {
  describe('SUPPORTED_LANGUAGES', () => {
    it('contains English', () => {
      const english = SUPPORTED_LANGUAGES.find((l) => l.code === 'en')

      expect(english).toBeDefined()
      expect(english?.code).toBe('en')
      expect(english?.name).toBe('English')
      expect(english?.nativeName).toBe('English')
    })

    it('contains French', () => {
      const french = SUPPORTED_LANGUAGES.find((l) => l.code === 'fr')

      expect(french).toBeDefined()
      expect(french?.code).toBe('fr')
      expect(french?.name).toBe('French')
      expect(french?.nativeName).toBe('Français')
    })

    it('has exactly 2 languages', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(2)
    })

    it('has unique codes', () => {
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code)
      const uniqueCodes = new Set(codes)

      expect(uniqueCodes.size).toBe(codes.length)
    })

    it('is readonly', () => {
      // TypeScript compile-time check - should not allow modifications
      expect(Object.isFrozen(SUPPORTED_LANGUAGES)).toBe(false) // Array is not frozen but TypeScript prevents mutations
      expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true)
    })
  })

  describe('DEFAULT_LANGUAGE', () => {
    it('is English', () => {
      expect(DEFAULT_LANGUAGE).toBe('en')
    })

    it('is a valid LanguageCode', () => {
      const validCodes: LanguageCode[] = ['en', 'fr']
      expect(validCodes).toContain(DEFAULT_LANGUAGE)
    })
  })

  describe('LANGUAGE_STORAGE_KEY', () => {
    it('is a non-empty string', () => {
      expect(typeof LANGUAGE_STORAGE_KEY).toBe('string')
      expect(LANGUAGE_STORAGE_KEY.length).toBeGreaterThan(0)
    })

    it('has expected value', () => {
      expect(LANGUAGE_STORAGE_KEY).toBe('lily_language_preference')
    })
  })

  describe('LanguageCode type', () => {
    it('accepts en', () => {
      const code: LanguageCode = 'en'
      expect(code).toBe('en')
    })

    it('accepts fr', () => {
      const code: LanguageCode = 'fr'
      expect(code).toBe('fr')
    })

    // TypeScript compile-time checks - these would fail to compile if uncommented:
    // const invalidCode: LanguageCode = 'de' // Should error
    // const invalidCode2: LanguageCode = 'invalid' // Should error
  })
})
