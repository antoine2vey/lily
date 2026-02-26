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

// Build KnowledgePgClientLive within the layer's own scope using a fresh MemoMap
// (Layer.buildWithScope), so it never shares the outer graph's PgClient tag.
// The pool's lifecycle is tied to this layer's scope — closed when KnowledgeDrizzle
// is released, not when PgDrizzle.make() finishes (which was the previous bug:
// Effect.provide(layer) uses scopedWith, creating a temporary scope that closes
// the pool immediately after construction, before any queries run).
export const KnowledgeDrizzleLive = Layer.scoped(
  KnowledgeDrizzle,
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const knowledgeContext = yield* Layer.buildWithScope(
      KnowledgePgClientLive,
      scope
    )
    return yield* Effect.provide(PgDrizzle.make(), knowledgeContext)
  })
)

export * from '@lily/knowledge-db/schema'
export { schema }
