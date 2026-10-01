import { PgClient, PgTypes } from '@effect/sql-pg'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { registerHalfvec } from '@lily/knowledge-db/halfvec'
import * as schema from '@lily/knowledge-db/schema'
import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy'
import { Config, Context, Effect, Layer } from 'effect'

export class KnowledgeDrizzle extends Context.Service<
  KnowledgeDrizzle,
  PgRemoteDatabase<Record<string, never>>
>()('KnowledgeDrizzle') {}

// The registry is filled after connecting because halfvec's OID is only
// known once the client can ask the database for it.
const KnowledgePgClientLive = PgClient.layerFrom(
  Effect.gen(function* () {
    const url = yield* Config.Redacted('KNOWLEDGE_DATABASE_URL')
    const types = PgTypes.makeRegistry()
    const client = yield* PgClient.make({ url, types })
    yield* registerHalfvec(client, types)
    return client
  })
)

// Build KnowledgePgClientLive within the layer's own scope using a fresh MemoMap
// (Layer.buildWithScope), so it never shares the outer graph's PgClient tag.
// The pool's lifecycle is tied to this layer's scope — closed when KnowledgeDrizzle
// is released, not when PgDrizzle.make() finishes (which was the previous bug:
// Effect.provide(layer) uses scopedWith, creating a temporary scope that closes
// the pool immediately after construction, before any queries run).
export const KnowledgeDrizzleLive = Layer.effect(
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
