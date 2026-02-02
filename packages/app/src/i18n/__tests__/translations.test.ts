import en from '../locales/en'
import fr from '../locales/fr'

/**
 * Recursively get all keys from a nested object
 */
function getNestedKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getNestedKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }

  return keys
}

describe('Translation files', () => {
  describe('Structure', () => {
    it('EN has common namespace', () => {
      expect(en.common).toBeDefined()
    })

    it('FR has common namespace', () => {
      expect(fr.common).toBeDefined()
    })

    it('EN has auth namespace', () => {
      expect(en.auth).toBeDefined()
    })

    it('FR has auth namespace', () => {
      expect(fr.auth).toBeDefined()
    })

    it('EN has home namespace', () => {
      expect(en.home).toBeDefined()
    })

    it('FR has home namespace', () => {
      expect(fr.home).toBeDefined()
    })

    it('EN has plants namespace', () => {
      expect(en.plants).toBeDefined()
    })

    it('FR has plants namespace', () => {
      expect(fr.plants).toBeDefined()
    })

    it('EN has settings namespace', () => {
      expect(en.settings).toBeDefined()
    })

    it('FR has settings namespace', () => {
      expect(fr.settings).toBeDefined()
    })

    it('EN has profile namespace', () => {
      expect(en.profile).toBeDefined()
    })

    it('FR has profile namespace', () => {
      expect(fr.profile).toBeDefined()
    })
  })

  describe('Key parity - common', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.common)
      const frKeys = getNestedKeys(fr.common)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.common)
      const frKeys = getNestedKeys(fr.common)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Key parity - auth', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.auth)
      const frKeys = getNestedKeys(fr.auth)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.auth)
      const frKeys = getNestedKeys(fr.auth)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Key parity - home', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.home)
      const frKeys = getNestedKeys(fr.home)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.home)
      const frKeys = getNestedKeys(fr.home)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Key parity - settings', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.settings)
      const frKeys = getNestedKeys(fr.settings)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.settings)
      const frKeys = getNestedKeys(fr.settings)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Key parity - profile', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.profile)
      const frKeys = getNestedKeys(fr.profile)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.profile)
      const frKeys = getNestedKeys(fr.profile)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Key parity - plants', () => {
    it('FR has all keys from EN', () => {
      const enKeys = getNestedKeys(en.plants)
      const frKeys = getNestedKeys(fr.plants)

      for (const key of enKeys) {
        expect(frKeys).toContain(key)
      }
    })

    it('EN has all keys from FR', () => {
      const enKeys = getNestedKeys(en.plants)
      const frKeys = getNestedKeys(fr.plants)

      for (const key of frKeys) {
        expect(enKeys).toContain(key)
      }
    })
  })

  describe('Value types', () => {
    it('all EN common values are strings', () => {
      const keys = getNestedKeys(en.common)
      const values = keys.map((key) => {
        const parts = key.split('.')
        let value: unknown = en.common
        for (const part of parts) {
          value = (value as Record<string, unknown>)[part]
        }
        return value
      })

      for (const value of values) {
        expect(typeof value).toBe('string')
      }
    })

    it('all FR common values are strings', () => {
      const keys = getNestedKeys(fr.common)
      const values = keys.map((key) => {
        const parts = key.split('.')
        let value: unknown = fr.common
        for (const part of parts) {
          value = (value as Record<string, unknown>)[part]
        }
        return value
      })

      for (const value of values) {
        expect(typeof value).toBe('string')
      }
    })
  })

  describe('Content verification', () => {
    it('EN common has required button translations', () => {
      expect(en.common.buttons).toBeDefined()
      expect(en.common.buttons.save).toBeDefined()
      expect(en.common.buttons.cancel).toBeDefined()
      expect(en.common.buttons.done).toBeDefined()
    })

    it('FR common has required button translations', () => {
      expect(fr.common.buttons).toBeDefined()
      expect(fr.common.buttons.save).toBeDefined()
      expect(fr.common.buttons.cancel).toBeDefined()
      expect(fr.common.buttons.done).toBeDefined()
    })

    it('EN auth has login translations', () => {
      expect(en.auth.login).toBeDefined()
      expect(en.auth.login.title).toBeDefined()
    })

    it('FR auth has login translations', () => {
      expect(fr.auth.login).toBeDefined()
      expect(fr.auth.login.title).toBeDefined()
    })

    it('EN home has greeting translations', () => {
      expect(en.home.greeting).toBeDefined()
      expect(en.home.greeting.morning).toBeDefined()
      expect(en.home.greeting.afternoon).toBeDefined()
      expect(en.home.greeting.evening).toBeDefined()
    })

    it('FR home has greeting translations', () => {
      expect(fr.home.greeting).toBeDefined()
      expect(fr.home.greeting.morning).toBeDefined()
      expect(fr.home.greeting.afternoon).toBeDefined()
      expect(fr.home.greeting.evening).toBeDefined()
    })

    it('EN settings has title', () => {
      expect(en.settings.title).toBe('Settings')
    })

    it('FR settings has title', () => {
      expect(fr.settings.title).toBe('Paramètres')
    })

    it('EN profile has title', () => {
      expect(en.profile.title).toBe('Profile')
    })

    it('FR profile has title', () => {
      expect(fr.profile.title).toBe('Profil')
    })
  })

  describe('No empty strings', () => {
    it('EN common has no empty strings', () => {
      const keys = getNestedKeys(en.common)
      for (const key of keys) {
        const parts = key.split('.')
        let value: unknown = en.common
        for (const part of parts) {
          value = (value as Record<string, unknown>)[part]
        }
        expect(value).not.toBe('')
      }
    })

    it('FR common has no empty strings', () => {
      const keys = getNestedKeys(fr.common)
      for (const key of keys) {
        const parts = key.split('.')
        let value: unknown = fr.common
        for (const part of parts) {
          value = (value as Record<string, unknown>)[part]
        }
        expect(value).not.toBe('')
      }
    })
  })
})
