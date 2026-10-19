import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { pgPoolConfig } from '@lily/db/pool-config'
import { Layer } from 'effect'

export const PgLive = PgClient.layerConfig(pgPoolConfig('DATABASE'))

// Drizzle layer with schema (includes PgDrizzle only)
export const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive))
