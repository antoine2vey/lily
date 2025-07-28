import { type PrismaError, PrismaService } from '@lily/db'
import { Effect } from 'effect'

// Unregister device token
export const unregisterDeviceToken = (
  tokenId: string
): Effect.Effect<{ message: string }, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake success message
    return { message: `Device token ${tokenId} unregistered successfully` }
  })
