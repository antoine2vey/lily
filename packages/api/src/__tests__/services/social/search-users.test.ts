import { mockFollowUsers } from '@lily/api/__tests__/fixtures/follows'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { searchUsers } from '@lily/api/services/social/endpoints/search-users'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'user-1'

const buildLayer = (
  follows: Array<{
    followerId: string
    followingId: string
    createdAt: Date
  }> = []
) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: currentUserId }),
    createMockFollowRepository({
      follows,
      users: mockFollowUsers,
    })
  )

describe('searchUsers', () => {
  it('should return matching public users', async () => {
    const result = await Effect.runPromise(
      searchUsers({ query: 'Alice', page: '1', limit: '20' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Alice')
  })

  it('should return empty list for no match', async () => {
    const result = await Effect.runPromise(
      searchUsers({ query: 'Zzzzz', page: '1', limit: '20' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('should not return private users', async () => {
    const result = await Effect.runPromise(
      searchUsers({ query: 'Private', page: '1', limit: '20' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    expect(result.items).toHaveLength(0)
  })

  it('should not return current user in results', async () => {
    const result = await Effect.runPromise(
      searchUsers({ query: '', page: '1', limit: '20' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    const ids = Array.map(result.items, (i) => i.id)
    expect(ids).not.toContain(currentUserId)
  })

  it('should include isFollowing status', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: 'follow-user-1',
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      searchUsers({ query: 'Alice', page: '1', limit: '20' }).pipe(
        Effect.provide(layer)
      )
    )
    expect(result.items[0]?.isFollowing).toBe(true)
  })
})
