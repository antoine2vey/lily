import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminUser } from '@lily/api/services/admin/middleware.types'
import { readIssuedAvatar } from '@lily/api/services/helpers/client-image'
import { AuthError } from '@lily/shared'
import type { AdminUserUpdateRequest } from '@lily/shared/admin'
import { CannotModifySelfError } from '@lily/shared/errors/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { GCSService } from '@lily/shared/services/file/gcs'
import { InvalidImageError } from '@lily/shared/services/file/image-upload'
import type { User } from '@lily/shared/user'
import { usernameProblem } from '@lily/shared/username'
import { Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const updateUser = (
  id: string,
  data: AdminUserUpdateRequest
): Effect.Effect<
  User,
  | SqlError
  | UserNotFoundError
  | CannotModifySelfError
  | AuthError
  | InvalidImageError,
  UserRepository | AdminUser | GCSService
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const currentAdmin = yield* AdminUser

    // Prevent admins from modifying their own status
    if (id === currentAdmin.id && data.status !== undefined) {
      return yield* new CannotModifySelfError()
    }

    if (data.name !== undefined) {
      yield* Option.match(usernameProblem(data.name), {
        onNone: () => Effect.void,
        onSome: (message) => Effect.fail(new AuthError({ message })),
      })
    }

    const image =
      typeof data.image === 'string'
        ? yield* Effect.flatMap(
            readIssuedAvatar(data.image, id),
            Option.match({
              onNone: () =>
                Effect.fail(
                  new InvalidImageError({
                    message:
                      'Image must be an avatar uploaded for this user, or null',
                  })
                ),
              onSome: Effect.succeed,
            })
          )
        : data.image

    const updated = yield* repo.update(id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(image !== undefined && { image }),
      ...(data.emailVerified !== undefined && {
        emailVerified: data.emailVerified,
      }),
      ...(data.status !== undefined && { status: data.status }),
    })

    if (!updated) {
      return yield* new UserNotFoundError()
    }

    return updated
  }).pipe(
    Effect.withSpan('AdminService.updateUser', {
      attributes: { 'user.id': id },
    })
  )
