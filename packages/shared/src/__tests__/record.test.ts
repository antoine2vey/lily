import { describe, expect, it } from 'vitest'
import { compact } from '../domains/common/record'

describe('Record Utilities', () => {
  describe('compact', () => {
    it('should remove undefined values from an object', () => {
      const obj = {
        name: 'Plant',
        description: undefined,
        age: 5,
      }

      const result = compact(obj)

      expect(result).toEqual({
        name: 'Plant',
        age: 5,
      })
      expect('description' in result).toBe(false)
    })

    it('should keep null values', () => {
      const obj = {
        name: 'Plant',
        description: null,
        notes: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        name: 'Plant',
        description: null,
      })
      expect('notes' in result).toBe(false)
    })

    it('should keep empty strings', () => {
      const obj = {
        name: '',
        value: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        name: '',
      })
    })

    it('should keep zero values', () => {
      const obj = {
        count: 0,
        value: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        count: 0,
      })
    })

    it('should keep false values', () => {
      const obj = {
        active: false,
        deleted: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        active: false,
      })
    })

    it('should return empty object when all values are undefined', () => {
      const obj = {
        a: undefined,
        b: undefined,
        c: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({})
    })

    it('should return same shape when no undefined values', () => {
      const obj = {
        name: 'Plant',
        age: 5,
        active: true,
      }

      const result = compact(obj)

      expect(result).toEqual(obj)
    })

    it('should merge defaults when provided', () => {
      const obj = {
        name: 'Plant',
        description: undefined,
      }
      const defaults = {
        createdAt: new Date('2024-01-01'),
      }

      const result = compact(obj, defaults)

      expect(result).toEqual({
        name: 'Plant',
        createdAt: new Date('2024-01-01'),
      })
    })

    it('should allow defaults to override compacted values', () => {
      const obj = {
        name: 'Original',
        value: 10,
        removed: undefined,
      }
      const defaults = {
        name: 'Overridden',
        extra: 'new',
      }

      const result = compact(obj, defaults)

      expect(result).toEqual({
        name: 'Overridden',
        value: 10,
        extra: 'new',
      })
    })

    it('should handle nested objects (does not deep compact)', () => {
      const obj = {
        name: 'Plant',
        metadata: {
          nested: undefined,
          value: 'kept',
        },
      }

      const result = compact(obj)

      // The nested object is kept as-is with its undefined value
      expect(result).toEqual({
        name: 'Plant',
        metadata: {
          nested: undefined,
          value: 'kept',
        },
      })
    })

    it('should handle arrays as values', () => {
      const obj = {
        items: ['a', 'b', 'c'],
        empty: [],
        missing: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        items: ['a', 'b', 'c'],
        empty: [],
      })
    })

    it('should work with empty object', () => {
      const result = compact({})

      expect(result).toEqual({})
    })

    it('should work with empty defaults', () => {
      const obj = {
        name: 'Plant',
        removed: undefined,
      }

      const result = compact(obj, {})

      expect(result).toEqual({
        name: 'Plant',
      })
    })

    it('should handle Date values correctly', () => {
      const now = new Date()
      const obj = {
        createdAt: now,
        updatedAt: undefined,
      }

      const result = compact(obj)

      expect(result).toEqual({
        createdAt: now,
      })
    })

    it('should preserve object references', () => {
      const nested = { key: 'value' }
      const obj = {
        data: nested,
        other: undefined,
      }

      const result = compact(obj)

      expect(result.data).toBe(nested)
    })
  })
})
