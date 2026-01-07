import {
  MockDrizzleLive,
  mockUsers,
  resetMockStore,
  setMockStore,
  setMockWhereFilter,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { findUserById } from './find-user-by-id'

describe('findUserById', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should return user when found', async () => {
    setMockWhereFilter((user) => user.id === 'user-1')

    const result = await Effect.runPromise(
      findUserById('user-1').pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result).toEqual(mockUsers[0])
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    setMockWhereFilter((user) => user.id === 'non-existent')

    const result = await Effect.runPromiseExit(
      findUserById('non-existent').pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when store is empty', async () => {
    setMockStore([])
    setMockWhereFilter(() => true)

    const result = await Effect.runPromiseExit(
      findUserById('any-id').pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result._tag).toBe('Failure')
  })
})
