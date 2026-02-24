import * as schema from '@lily/knowledge-db/schema'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Config, Context, Effect, Layer } from 'effect'
import { Pool } from 'pg'

export class KnowledgeDrizzle extends Context.Tag('KnowledgeDrizzle')<
  KnowledgeDrizzle,
  NodePgDatabase<typeof schema>
>() {}

export const KnowledgeDrizzleLive = Layer.effect(
  KnowledgeDrizzle,
  Effect.gen(function* () {
    const url = yield* Config.string('KNOWLEDGE_DATABASE_URL')
    const pool = new Pool({ connectionString: url })
    return drizzle(pool, { schema })
  })
)

export * from '@lily/knowledge-db/schema'
export { schema }
