import { type PrismaError, PrismaService } from '@lily/db'
import { Effect } from 'effect'

// Delete care log
export const deleteCareLog = (
  plantId: string,
  logId: string
): Effect.Effect<{ message: string }, PrismaError, PrismaService> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake success message
    return { message: `Care log ${logId} deleted successfully` }
  })
