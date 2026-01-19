import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import type { AdminUserUpdateRequest } from '@lily/shared/admin'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const updateUser = (
  id: string,
  data: AdminUserUpdateRequest
): Effect.Effect<
  User,
  SqlError | UserNotFoundError | CannotModifySelfError,
  UserRepository | AdminUser
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from modifying their own status
    if (id === currentAdmin.id && data.status !== undefined) {
      return yield* Effect.fail(new CannotModifySelfError())
    }

    const updated = yield* repo.update(id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.image !== undefined && { image: data.image }),
      ...(data.emailVerified !== undefined && {
        emailVerified: data.emailVerified,
      }),
      ...(data.status !== undefined && { status: data.status }),
    })

    if (!updated) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return updated
  })
