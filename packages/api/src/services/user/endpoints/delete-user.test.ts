import {
  getMockStore,
  MockDrizzleLive,
  resetMockStore,
  setMockStore,
  setMockWhereFilter,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteUser } from './delete-user'

describe('deleteUser', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should delete existing user', async () => {
    const initialCount = getMockStore().length
    setMockWhereFilter((user) => user.id === 'user-1')

    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result.id).toBe('user-1')
    expect(getMockStore().length).toBe(initialCount - 1)
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    setMockStore([])
    setMockWhereFilter((user) => user.id === 'non-existent')

    const result = await Effect.runPromiseExit(
      deleteUser('non-existent').pipe(Effect.provide(MockDrizzleLive))
    )

    expect(result._tag).toBe('Failure')
  })
})
