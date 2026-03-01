import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { PgClient } from '@effect/sql-pg'
import { Config, Layer } from 'effect'

// PostgreSQL client configuration
export const PgLive = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL'),
})

// Drizzle layer with schema (includes PgDrizzle only)
export const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive))
