import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockGiftCodeRepository } from '@lily/api/__tests__/mocks/gift-code.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { GiftCodeRecord } from '@lily/api/repositories/gift-code.repository'
import { createGiftCode } from '@lily/api/services/admin/endpoints/create-gift-code'
import { deleteGiftCode } from '@lily/api/services/admin/endpoints/delete-gift-code'
import { getGiftCode } from '@lily/api/services/admin/endpoints/get-gift-code'
import { listGiftCodes } from '@lily/api/services/admin/endpoints/list-gift-codes'
import { updateGiftCode } from '@lily/api/services/admin/endpoints/update-gift-code'
import { Cause, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockCode: GiftCodeRecord = {
  id: 'code-1',
  code: 'SPRING2026',
  duration: '1m',
  maxUsages: 100,
  currentUsages: 5,
  isActive: true,
  expiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const mockCodes: readonly GiftCodeRecord[] = [
  mockCode,
  {
    id: 'code-2',
    code: 'SUMMER2026',
    duration: '7d',
    maxUsages: 0,
    currentUsages: 42,
    isActive: false,
    expiresAt: new Date('2026-08-01'),
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
  },
]

describe('Admin Gift Code CRUD', () => {
  describe('createGiftCode', () => {
    it('should create a new gift code', async () => {
      const result = await Effect.runPromise(
        createGiftCode({
          code: 'NEWYEAR',
          duration: '1y',
          maxUsages: 50,
        }).pipe(Effect.provide(createMockGiftCodeRepository()))
      )

      expect(result.code).toBe('NEWYEAR')
      expect(result.duration).toBe('1y')
      expect(result.maxUsages).toBe(50)
      expect(result.currentUsages).toBe(0)
      expect(result.isActive).toBe(true)
    })

    it('should reject expiry date in the past', async () => {
      const result = await Effect.runPromiseExit(
        createGiftCode({
          code: 'PASTCODE',
          duration: '1m',
          maxUsages: 10,
          expiresAt: new Date('2020-01-01'),
        }).pipe(Effect.provide(createMockGiftCodeRepository()))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeExpiryInPastError')
        }
      }
    })

    it('should reject duplicate code', async () => {
      const result = await Effect.runPromiseExit(
        createGiftCode({
          code: 'SPRING2026',
          duration: '1m',
          maxUsages: 10,
        }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeDuplicateError')
        }
      }
    })
  })

  describe('listGiftCodes', () => {
    it('should return paginated gift codes', async () => {
      const result = await Effect.runPromise(
        listGiftCodes({ page: '1', limit: '20' }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.hasMore).toBe(false)
    })
  })

  describe('getGiftCode', () => {
    it('should return gift code with redemptions', async () => {
      const result = await Effect.runPromise(
        getGiftCode('code-1').pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(result.id).toBe('code-1')
      expect(result.code).toBe('SPRING2026')
      expect(result.redemptions).toBeDefined()
    })

    it('should fail when code not found', async () => {
      const result = await Effect.runPromiseExit(
        getGiftCode('non-existent').pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeNotFoundError')
        }
      }
    })
  })

  describe('updateGiftCode', () => {
    it('should update gift code fields', async () => {
      const result = await Effect.runPromise(
        updateGiftCode('code-1', { maxUsages: 200, isActive: false }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(result.maxUsages).toBe(200)
      expect(result.isActive).toBe(false)
    })

    it('should reject expiry date in the past', async () => {
      const result = await Effect.runPromiseExit(
        updateGiftCode('code-1', {
          expiresAt: new Date('2020-01-01'),
        }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeExpiryInPastError')
        }
      }
    })

    it('should fail when code not found', async () => {
      const result = await Effect.runPromiseExit(
        updateGiftCode('non-existent', { maxUsages: 10 }).pipe(
          Effect.provide(createMockGiftCodeRepository())
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeNotFoundError')
        }
      }
    })

    it('should reject maxUsages below currentUsages', async () => {
      const result = await Effect.runPromiseExit(
        updateGiftCode('code-1', { maxUsages: 2 }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeMaxUsagesTooLowError')
        }
      }
    })

    it('should allow setting maxUsages to 0 (unlimited)', async () => {
      const result = await Effect.runPromise(
        updateGiftCode('code-1', { maxUsages: 0 }).pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(result.maxUsages).toBe(0)
    })
  })

  describe('deleteGiftCode', () => {
    it('should delete gift code', async () => {
      const result = await Effect.runPromise(
        deleteGiftCode('code-1').pipe(
          Effect.provide(createMockGiftCodeRepository({ codes: mockCodes }))
        )
      )

      expect(result.id).toBe('code-1')
      expect(result.code).toBe('SPRING2026')
    })

    it('should fail when code not found', async () => {
      const result = await Effect.runPromiseExit(
        deleteGiftCode('non-existent').pipe(
          Effect.provide(createMockGiftCodeRepository())
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(error._tag).toBe('Some')
        if (error._tag === 'Some') {
          expect(error.value._tag).toBe('GiftCodeNotFoundError')
        }
      }
    })
  })
})
