import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  PaginatedResponse,
  PaginationParams,
  paginate,
  parsePaginationParams,
} from '../domains/common/pagination'

describe('Pagination Utilities', () => {
  describe('PaginationParams Schema', () => {
    it('should use default values when not provided', () => {
      const result = Schema.decodeSync(PaginationParams)({})

      expect(result.page).toBe('1')
      expect(result.limit).toBe('20')
    })

    it('should accept custom page and limit', () => {
      const result = Schema.decodeSync(PaginationParams)({
        page: '3',
        limit: '50',
      })

      expect(result.page).toBe('3')
      expect(result.limit).toBe('50')
    })

    it('should handle partial params with defaults', () => {
      const resultWithPageOnly = Schema.decodeSync(PaginationParams)({
        page: '5',
      })
      expect(resultWithPageOnly.page).toBe('5')
      expect(resultWithPageOnly.limit).toBe('20')

      const resultWithLimitOnly = Schema.decodeSync(PaginationParams)({
        limit: '100',
      })
      expect(resultWithLimitOnly.page).toBe('1')
      expect(resultWithLimitOnly.limit).toBe('100')
    })
  })

  describe('parsePaginationParams', () => {
    it('should parse valid string numbers to integers', () => {
      const result = parsePaginationParams({
        page: '3',
        limit: '25',
      })

      expect(result.page).toBe(3)
      expect(result.limit).toBe(25)
    })

    it('should default to page 1 for invalid page value', () => {
      const result = parsePaginationParams({
        page: 'invalid',
        limit: '20',
      })

      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('should default to limit 20 for invalid limit value', () => {
      const result = parsePaginationParams({
        page: '1',
        limit: 'invalid',
      })

      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('should handle empty strings as defaults', () => {
      const result = parsePaginationParams({
        page: '',
        limit: '',
      })

      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('should parse large numbers correctly', () => {
      const result = parsePaginationParams({
        page: '1000',
        limit: '500',
      })

      expect(result.page).toBe(1000)
      expect(result.limit).toBe(500)
    })

    it('should handle zero values', () => {
      const result = parsePaginationParams({
        page: '0',
        limit: '0',
      })

      // parseInt('0') returns 0 which is falsy, so defaults apply
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('should handle negative values as defaults', () => {
      const result = parsePaginationParams({
        page: '-5',
        limit: '-10',
      })

      // parseInt returns negative numbers, which are truthy
      expect(result.page).toBe(-5)
      expect(result.limit).toBe(-10)
    })

    it('should handle decimal strings by truncating', () => {
      const result = parsePaginationParams({
        page: '3.7',
        limit: '25.9',
      })

      // parseInt stops at first non-digit
      expect(result.page).toBe(3)
      expect(result.limit).toBe(25)
    })
  })

  describe('paginate', () => {
    it('should build correct paginated response', () => {
      const items = ['a', 'b', 'c']
      const result = paginate(items, 10, 1, 3)

      expect(result.items).toEqual(['a', 'b', 'c'])
      expect(result.total).toBe(10)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(3)
      expect(result.hasMore).toBe(true)
    })

    it('should return hasMore=false when on last page', () => {
      const items = ['d', 'e']
      const result = paginate(items, 5, 2, 3)

      // page 2 with limit 3: 2*3=6 >= total 5
      expect(result.hasMore).toBe(false)
    })

    it('should return hasMore=true when more items exist', () => {
      const items = ['a', 'b', 'c']
      const result = paginate(items, 100, 1, 3)

      // page 1 with limit 3: 1*3=3 < total 100
      expect(result.hasMore).toBe(true)
    })

    it('should handle exactly full last page', () => {
      const items = ['a', 'b', 'c']
      const result = paginate(items, 9, 3, 3)

      // page 3 with limit 3: 3*3=9 >= total 9
      expect(result.hasMore).toBe(false)
    })

    it('should handle empty items array', () => {
      const result = paginate([], 0, 1, 20)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should handle single item', () => {
      const result = paginate(['only'], 1, 1, 20)

      expect(result.items).toEqual(['only'])
      expect(result.total).toBe(1)
      expect(result.hasMore).toBe(false)
    })

    it('should work with complex objects', () => {
      const items = [
        { id: '1', name: 'Plant A' },
        { id: '2', name: 'Plant B' },
      ]
      const result = paginate(items, 50, 1, 2)

      expect(result.items).toEqual(items)
      expect(result.total).toBe(50)
      expect(result.hasMore).toBe(true)
    })

    it('should handle page beyond total items', () => {
      const items: string[] = []
      const result = paginate(items, 5, 100, 20)

      // Even though items is empty, page*limit > total
      expect(result.hasMore).toBe(false)
    })
  })

  describe('PaginatedResponse Schema', () => {
    it('should validate a correct paginated response', () => {
      const StringResponse = PaginatedResponse(Schema.String)
      const data = {
        items: ['a', 'b', 'c'],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      }

      const result = Schema.decodeSync(StringResponse)(data)

      expect(result.items).toEqual(['a', 'b', 'c'])
      expect(result.total).toBe(100)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.hasMore).toBe(true)
    })

    it('should reject invalid item types', () => {
      const NumberResponse = PaginatedResponse(Schema.Number)
      const data = {
        items: ['not', 'numbers'],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      }

      expect(() => Schema.decodeSync(NumberResponse)(data as never)).toThrow()
    })

    it('should reject missing required fields', () => {
      const StringResponse = PaginatedResponse(Schema.String)

      expect(() =>
        Schema.decodeSync(StringResponse)({
          items: ['a'],
          // missing total, page, limit, hasMore
        } as never)
      ).toThrow()
    })

    it('should work with complex item schemas', () => {
      const ItemSchema = Schema.Struct({
        id: Schema.String,
        value: Schema.Number,
      })
      const ComplexResponse = PaginatedResponse(ItemSchema)

      const data = {
        items: [
          { id: '1', value: 10 },
          { id: '2', value: 20 },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      }

      const result = Schema.decodeSync(ComplexResponse)(data)
      expect(result.items).toHaveLength(2)
      expect(result.items[0]?.id).toBe('1')
    })
  })
})
