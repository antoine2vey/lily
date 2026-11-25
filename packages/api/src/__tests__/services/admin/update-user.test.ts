import type { UserFixture } from '@lily/api/__tests__/fixtures/users'
import { mockAdminUser, mockUsers } from '@lily/api/__tests__/fixtures/users'
import {
  createMockGCSService,
  mockPublicUrl,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUser } from '@lily/api/services/admin/endpoints/update-user'
import { AdminUser } from '@lily/api/services/admin/middleware'
import { InvalidImageError } from '@lily/api/services/file/image-upload'
import type { UserProfile } from '@lily/shared/auth'
import { failureOf } from '@lily/shared/testing'
import type { User } from '@lily/shared/user'
import { Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const mockAdminContext: UserProfile = {
  id: mockAdminUser.id,
  email: mockAdminUser.email,
  name: mockAdminUser.name,
  firstName: null,
  lastName: null,
  username: mockAdminUser.name ?? undefined,
  createdAt: mockAdminUser.createdAt,
  updatedAt: mockAdminUser.updatedAt,
  role: mockAdminUser.role,
  status: mockAdminUser.status,
}

const mockAdminLayer = Layer.succeed(AdminUser, mockAdminContext)

const deps = (users: UserFixture[]) =>
  Layer.mergeAll(
    createMockUserRepository(users),
    mockAdminLayer,
    createMockGCSService()
  )

describe('updateUser', () => {
  it('should update user name', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'updated_name' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.name).toBe('updated_name')
  })

  it('should update user email', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { email: 'newemail@example.com' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.email).toBe('newemail@example.com')
  })

  it('should update user bio', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { bio: 'New bio description' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.bio).toBe('New bio description')
  })

  it('should update user status', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { status: 'suspended' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.status).toBe('suspended')
  })

  it('should fail when user not found', async () => {
    const result = await Effect.runPromiseExit(
      updateUser('non-existent', { name: 'new_name' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(failureOf(result)._tag).toBe('UserNotFoundError')
  })

  it('should fail when admin tries to modify own status', async () => {
    const result = await Effect.runPromiseExit(
      updateUser(mockAdminUser.id, { status: 'suspended' }).pipe(
        Effect.provide(deps([mockAdminUser]))
      )
    )

    expect(failureOf(result)._tag).toBe('CannotModifySelfError')
  })

  it('should allow admin to modify own non-status fields', async () => {
    const result = await Effect.runPromise(
      updateUser(mockAdminUser.id, { name: 'updated_admin' }).pipe(
        Effect.provide(deps([mockAdminUser]))
      )
    )

    expect(result.name).toBe('updated_admin')
  })

  it('should allow partial updates', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { name: 'only_name' }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.name).toBe('only_name')
    expect(result.email).toBe('test@example.com') // Original email
  })

  it('should update multiple fields at once', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', {
        name: 'new_name',
        email: 'new@example.com',
        bio: 'New bio',
      }).pipe(Effect.provide(deps([...mockUsers])))
    )

    expect(result.name).toBe('new_name')
    expect(result.email).toBe('new@example.com')
    expect(result.bio).toBe('New bio')
  })

  it('sets an avatar the upload flow issued for the user', async () => {
    const avatar = mockPublicUrl(
      'users/user-1/avatars/0b7e5a52-3c8f-4d0e-9a51-6f2d1c4b8e90.webp'
    )

    const result = await Effect.runPromise(
      updateUser('user-1', { image: avatar }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.image).toBe(avatar)
  })

  it('clears the avatar', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { image: null }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.image).toBeNull()
  })

  it.each([
    [
      "a photo in a plant's folder",
      mockPublicUrl('plants/plant-1/0b7e5a52-3c8f-4d0e-9a51-6f2d1c4b8e90.jpg'),
    ],
    [
      "another user's avatar",
      mockPublicUrl(
        'users/user-2/avatars/0b7e5a52-3c8f-4d0e-9a51-6f2d1c4b8e90.jpg'
      ),
    ],
    [
      'a key the upload flow never makes',
      mockPublicUrl('users/user-1/avatars/../../../plants/plant-1/cover.jpg'),
    ],
    [
      'a bare avatar key',
      'users/user-1/avatars/0b7e5a52-3c8f-4d0e-9a51-6f2d1c4b8e90.jpg',
    ],
    ['a URL on another host', 'https://example.com/new-avatar.png'],
  ])('refuses %s and keeps the avatar', async (_case, image) => {
    const users = [...mockUsers]
    const before = users.find((user) => user.id === 'user-1')?.image

    const exit = await Effect.runPromiseExit(
      updateUser('user-1', { image }).pipe(Effect.provide(deps(users)))
    )

    expect({
      error: Option.getOrUndefined(Exit.findErrorOption(exit)),
      image: users.find((user) => user.id === 'user-1')?.image,
    }).toEqual({
      error: expect.any(InvalidImageError),
      image: before,
    })
  })

  it('should update emailVerified status', async () => {
    const result = await Effect.runPromise(
      updateUser('user-1', { emailVerified: false }).pipe(
        Effect.provide(deps([...mockUsers]))
      )
    )

    expect(result.emailVerified).toBe(false)
  })
})
