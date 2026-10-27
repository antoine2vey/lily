import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { mockAdminUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockRefreshTokenRepository } from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  canopyWorld,
  memberUsers,
} from '@lily/api/__tests__/services/canopy/canopy-world'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { cleanupExpiredAccounts } from '@lily/api/services/account-cleanup/scheduler'
import { deleteUser } from '@lily/api/services/admin/endpoints/delete-user'
import { AdminUser } from '@lily/api/services/admin/middleware'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import type { User } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

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

const databaseDown = new SqlError({
  reason: new UnknownError({
    cause: new Error('database unreachable'),
    message: 'database unreachable',
  }),
})

const canopyFailingFor = (store: MockCanopyStore, failingUserId: string) =>
  Layer.effect(
    CanopyRepository,
    Effect.map(CanopyRepository, (repo) => ({
      ...repo,
      findMembershipByUser: (userId: string) =>
        userId === failingUserId
          ? Effect.fail(databaseDown)
          : repo.findMembershipByUser(userId),
    }))
  ).pipe(Layer.provide(createMockCanopyRepository(store)))

const recordingUsers = (
  users: User[],
  writes: string[],
  expired: User[] = []
) =>
  Layer.effect(
    UserRepository,
    Effect.map(UserRepository, (repo) => ({
      ...repo,
      softDelete: (id: string) =>
        Effect.andThen(
          Effect.sync(() => writes.push(`soft:${id}`)),
          repo.softDelete(id)
        ),
      delete: (id: string) =>
        Effect.andThen(
          Effect.sync(() => writes.push(`hard:${id}`)),
          repo.delete(id)
        ),
      findExpiredDeletions: () => Effect.succeed(expired),
    }))
  ).pipe(Layer.provide(createMockUserRepository(users)))

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

  it('keeps the account active when leaving the Canopy fails', async () => {
    const store = home()
    const writes: string[] = []
    const users = memberUsers(store)

    const exit = await Effect.runPromiseExit(
      deleteAccount().pipe(
        Effect.provide(
          Layer.mergeAll(
            canopyWorld(store, { id: 'alex' }).layer,
            createMockRefreshTokenRepository(),
            canopyFailingFor(store, 'alex'),
            recordingUsers(users, writes)
          )
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(writes).toEqual([])
    expect(roleOf(store, 'alex')).toBe('owner')
  })

  it("deletes the rest of the batch when one account's Canopy exit fails", async () => {
    const store = home()
    const writes: string[] = []
    const users = memberUsers(store)
    const expired = users.filter((u) => u.id === 'alex' || u.id === 'lily')

    const exit = await Effect.runPromiseExit(
      cleanupExpiredAccounts.pipe(
        Effect.provide(
          Layer.mergeAll(
            canopyWorld(store, { id: 'scheduler' }).layer,
            canopyFailingFor(store, 'alex'),
            recordingUsers(users, writes, expired)
          )
        )
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(writes).toEqual(['hard:lily'])
    expect(roleOf(store, 'alex')).toBe('owner')
    expect(roleOf(store, 'lily')).toBeUndefined()
  })
})
