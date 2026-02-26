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

// Use Effect.provide(layer) so the knowledge PgClient is built in isolation,
// never sharing the global PgDrizzle.PgDrizzle memo with the main database.
export const KnowledgeDrizzleLive = Layer.scoped(
  KnowledgeDrizzle,
  PgDrizzle.make().pipe(Effect.provide(KnowledgePgClientLive))
)

export * from '@lily/knowledge-db/schema'
export { schema }
