import { type PrismaError, PrismaService } from '@lily/db'
import type { User } from '@lily/shared'
import { Effect } from 'effect'

// User service methods
export const findUsers = (): Effect.Effect<
  User[],
  PrismaError,
  PrismaService
> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService
    return yield* prisma.user.findMany()
  })
