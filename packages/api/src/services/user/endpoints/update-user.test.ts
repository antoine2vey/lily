import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  MockDrizzleLive,
  resetMockStore,
  setMockStore,
  setMockWhereFilter,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { updateUser } from './update-user'

const TestLayer = UserRepositoryLive.pipe(Layer.provide(MockDrizzleLive))

describe('updateUser', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should update user fields', async () => {
    setMockWhereFilter((user) => user.id === 'user-1')

    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'Updated Name' }).pipe(
        Effect.provide(TestLayer)
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should fail with UserNotFoundError when user not found', async () => {
    setMockStore([])
    setMockWhereFilter((user) => user.id === 'non-existent')

    const result = await Effect.runPromiseExit(
      updateUser('non-existent', { name: 'Test' }).pipe(
        Effect.provide(TestLayer)
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
