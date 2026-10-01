import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { Config, Layer } from 'effect'

// PostgreSQL client configuration
export const PgLive = PgClient.layerConfig({
  url: Config.Redacted('DATABASE_URL'),
})

// Drizzle layer with schema (includes PgDrizzle only)
export const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive))
