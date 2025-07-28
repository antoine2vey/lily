import { type PrismaError, PrismaService } from '@lily/db'
import type { User } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const deleteUser = (
  id: string
): Effect.Effect<User, PrismaError | UserNotFoundError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const user = yield* prisma.user.delete({
      where: { id },
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
