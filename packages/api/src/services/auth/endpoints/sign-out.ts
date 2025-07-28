import { PrismaService } from '@lily/db'
import { Effect } from 'effect'

// Sign out
export const signOut = (): Effect.Effect<
  { message: string },
  never,
  PrismaService
> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake success message
    return { message: 'Successfully signed out' }
  })
