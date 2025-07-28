import { type PrismaError, PrismaService } from '@lily/db'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const updateUser = (
  id: string,
  data: { name?: string; email?: string }
): Effect.Effect<User, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    return yield* prisma.user.update({
      where: { id },
      data,
    })
  })
