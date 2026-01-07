import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  getMockStore,
  MockDrizzleLive,
  resetMockStore,
  setMockStore,
  setMockWhereFilter,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteUser } from './delete-user'

const TestLayer = UserRepositoryLive.pipe(Layer.provide(MockDrizzleLive))

describe('deleteUser', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should delete existing user', async () => {
    const initialCount = getMockStore().length
    setMockWhereFilter((user) => user.id === 'user-1')

    const result = await Effect.runPromise(
      deleteUser('user-1').pipe(Effect.provide(TestLayer))
    )

    expect(result.id).toBe('user-1')
    expect(getMockStore().length).toBe(initialCount - 1)
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    setMockStore([])
    setMockWhereFilter((user) => user.id === 'non-existent')

    const result = await Effect.runPromiseExit(
      deleteUser('non-existent').pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe('Failure')
  })
})
