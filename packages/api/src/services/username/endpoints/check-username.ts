import { type PrismaError, PrismaService } from '@lily/db'
import type { UsernameAvailability } from '@lily/shared/username'
import { Effect } from 'effect'

// Check username availability
export const checkUsername = (
  username: string
): Effect.Effect<UsernameAvailability, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    const user = yield* prisma.user.findUnique({
      where: { name: username },
    })

    return {
      username,
      available: user === null,
    }
  })
