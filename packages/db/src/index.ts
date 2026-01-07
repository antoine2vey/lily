import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { PgClient } from '@effect/sql-pg'
import * as schema from '@lily/db/schema'
import { Config, Data, Layer } from 'effect'

// Error type for database operations
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  cause: unknown
}> {}

// PostgreSQL client configuration
const PgLive = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL'),
})

// Drizzle layer with schema
export const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive))

// Re-export Drizzle for use in endpoints
export { PgDrizzle }

// Re-export schema for convenience
export * from '@lily/db/schema'
export { schema }
