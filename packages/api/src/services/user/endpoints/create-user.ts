import { type PrismaError, PrismaService } from '@lily/db'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const createUser = (
  name: string,
  email: string
): Effect.Effect<User, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    return yield* prisma.user.create({
      data: { name, email, emailVerified: false },
    })
  })
