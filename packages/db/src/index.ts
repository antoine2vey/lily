import { PrismaClient } from '@prisma/client'
import { Effect } from 'effect'

export class Database extends Effect.Service<Database>()('Database', {
  effect: Effect.gen(function* () {
    const client = new PrismaClient()

    // Connect to database
    yield* Effect.promise(() => client.$connect())

    return {
      client,
    }
  }),
}) {}

// Export the database service as default
export default Database
