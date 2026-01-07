import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import {
  MockDrizzleLive,
  mockUsers,
  resetMockStore,
} from '@lily/api/test-utils/mocks/drizzle'
import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { findUsers } from './find-users'

const TestLayer = UserRepositoryLive.pipe(Layer.provide(MockDrizzleLive))

describe('findUsers', () => {
  beforeEach(() => {
    resetMockStore()
  })

  it('should return all users', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(TestLayer))
    )

    expect(result).toEqual(mockUsers)
  })

  it('should return an array', async () => {
    const result = await Effect.runPromise(
      findUsers().pipe(Effect.provide(TestLayer))
    )

    expect(Array.isArray(result)).toBe(true)
  })
})
