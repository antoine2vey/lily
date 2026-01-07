import {
  MockDrizzleLive,
  mockUsers,
  resetMockStore,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { findUsers } from './find-users'

describe('findUsers', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should return all users', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result).toEqual(mockUsers)
  })

  it('should return an array', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(MockDrizzleLive))
    )

    expect(Array.isArray(result)).toBe(true)
  })
})
