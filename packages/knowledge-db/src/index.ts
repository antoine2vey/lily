import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { PgClient } from '@effect/sql-pg'
import * as schema from '@lily/knowledge-db/schema'
import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy'
import { Config, Context, Effect, Layer } from 'effect'

export class KnowledgeDrizzle extends Context.Tag('KnowledgeDrizzle')<
  KnowledgeDrizzle,
  PgRemoteDatabase<Record<string, never>>
>() {}

const KnowledgePgClientLive = PgClient.layerConfig({
  url: Config.redacted('KNOWLEDGE_DATABASE_URL'),
})

export const KnowledgeDrizzleLive = Layer.effect(
  KnowledgeDrizzle,
  Effect.gen(function* () {
    return yield* PgDrizzle.PgDrizzle
  })
).pipe(Layer.provide(PgDrizzle.layer), Layer.provide(KnowledgePgClientLive))

export * from '@lily/knowledge-db/schema'
export { schema }
