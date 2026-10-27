import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { mockAdminUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockRefreshTokenRepository } from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  canopyWorld,
  memberUsers,
} from '@lily/api/__tests__/services/canopy/canopy-world'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { AdminUser } from '@lily/api/services/admin/middleware'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

/**
 * Alex owns Home. Sam joined before Lily, so Sam is the longest-standing
 * member after Alex even though Lily is listed first. One Canopy plant and
 * one Canopy room.
 */
const home = (): MockCanopyStore =>
  createCanopyStore({
    canopies: [createTestCanopyRow({ id: 'canopy-1', name: 'Home' })],
    members: [
      {
        canopyId: mockCanopyId,
        userId: 'lily',
        name: 'Lily',
        role: 'member',
        joinedAt: new Date('2024-06-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'alex',
        name: 'Alex',
        role: 'owner',
        joinedAt: new Date('2024-01-01'),
      },
      {
        canopyId: mockCanopyId,
        userId: 'sam',
        name: 'Sam',
        role: 'member',
        joinedAt: new Date('2024-03-01'),
      },
    ],
    plants: [
      {
        id: 'fern',
        canopyId: mockCanopyId,
        userId: null,
        remindersEnabled: true,
        diedAt: null,
      },
    ],
    rooms: [{ id: 'kitchen', canopyId: mockCanopyId, userId: null }],
  })

const soloHome = (): MockCanopyStore => {
  const store = home()
  store.members.splice(0, store.members.length, {
    canopyId: mockCanopyId,
    userId: 'alex',
    name: 'Alex',
    role: 'owner',
    joinedAt: new Date('2024-01-01'),
  })
  return store
}

const roleOf = (store: MockCanopyStore, userId: string) =>
  store.members.find((m) => m.userId === userId)?.role

describe('account deletion', () => {
  it('ends the membership at the deletion request, with the handover', async () => {
    const store = home()
    const world = canopyWorld(store, { id: 'alex', name: 'Alex' })

    const exit = await Effect.runPromiseExit(
      deleteAccount().pipe(
        Effect.provide(
          Layer.merge(world.layer, createMockRefreshTokenRepository())
        )
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(roleOf(store, 'alex')).toBeUndefined()
    expect(roleOf(store, 'sam')).toBe('owner')
    expect(store.plants[0]?.canopyId).toBe('canopy-1')
  })

  it("gives a sole member's Canopy plants back to them before an admin hard delete", async () => {
    const store = soloHome()
    const world = canopyWorld(store, { id: mockAdminUser.id })
    const users = [...memberUsers(store), mockAdminUser]

    const exit = await Effect.runPromiseExit(
      deleteUser('alex').pipe(
        Effect.provide(
          Layer.mergeAll(
            world.layer,
            createMockUserRepository(users),
            Layer.succeed(AdminUser, {
              id: mockAdminUser.id,
              email: mockAdminUser.email,
              name: mockAdminUser.name,
              firstName: null,
              lastName: null,
              createdAt: mockAdminUser.createdAt,
              updatedAt: mockAdminUser.updatedAt,
              role: 'admin',
              status: 'active',
            })
          )
        )
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(store.canopies).toEqual([])
    expect(store.plants[0]).toMatchObject({ canopyId: null, userId: 'alex' })
  })
})
