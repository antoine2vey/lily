import { KnowledgeDrizzle, KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { decodeHalfvec } from '@lily/knowledge-db/halfvec'
import { vector } from '@lily/knowledge-db/schema/processed-chunks'
import { eq, sql } from 'drizzle-orm'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import {
  Array,
  ConfigProvider,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Result,
  String,
} from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hex = (digits: string) =>
  Uint8Array.from(
    Array.map(Array.chunksOf(String.split('')(digits), 2), (pair) =>
      Number.parseInt(Array.join(pair, ''), 16)
    )
  )

describe('decodeHalfvec', () => {
  it("decodes pgvector's halfvec_send output", () => {
    // select halfvec_send('[1,2.5,-0.125]'::halfvec) on pgvector 0.8.1
    expect(decodeHalfvec(hex('000300003c004100b000'))).toEqual(
      Result.succeed([1, 2.5, -0.125])
    )
  })

  it('decodes subnormal, largest finite and infinite halves', () => {
    expect(
      decodeHalfvec(hex('00040000' + '0001' + '7bff' + '8400' + 'fc00'))
    ).toEqual(Result.succeed([2 ** -24, 65504, -(2 ** -14), -Infinity]))
  })

  it('rejects a payload whose length disagrees with its dimension', () => {
    expect(Result.isFailure(decodeHalfvec(hex('000300003c00')))).toBe(true)
    expect(Result.isFailure(decodeHalfvec(hex('0000')))).toBe(true)
  })
})

const url = Option.fromUndefinedOr(process.env.TEST_DATABASE_URL)

const tableName = `halfvec_roundtrip_${String.replaceAll('-', '_')(crypto.randomUUID())}`

const embeddings = pgTable(tableName, {
  id: integer('id').primaryKey(),
  embedding: vector('embedding'),
})

// Every value is exact in binary16, so the read must match bit for bit.
const embedding = Array.makeBy(3072, (i) =>
  Option.getOrElse(
    Array.get([65504, 2 ** -24, -(2 ** -14)], i),
    () => (i - 1536) / 128
  )
)

describe.skipIf(Option.isNone(url))(
  'halfvec through KnowledgeDrizzleLive',
  () => {
    const runtime = ManagedRuntime.make(
      KnowledgeDrizzleLive.pipe(
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              KNOWLEDGE_DATABASE_URL: Option.getOrElse(url, () => ''),
            })
          )
        )
      )
    )
    const run = <A, E>(effect: Effect.Effect<A, E, KnowledgeDrizzle>) =>
      runtime.runPromise(effect)

    beforeAll(() =>
      run(
        Effect.gen(function* () {
          const db = yield* KnowledgeDrizzle
          yield* db.execute(
            sql.raw(
              `create table "${tableName}" (id integer primary key, embedding halfvec(3072))`
            )
          )
        })
      )
    )

    afterAll(async () => {
      await run(
        Effect.gen(function* () {
          const db = yield* KnowledgeDrizzle
          yield* db.execute(sql.raw(`drop table if exists "${tableName}"`))
        })
      )
      await runtime.dispose()
    })

    it('reads back exactly the halfvec it wrote', async () => {
      const rows = await run(
        Effect.gen(function* () {
          const db = yield* KnowledgeDrizzle
          yield* db.insert(embeddings).values({ id: 1, embedding })
          return yield* db.select().from(embeddings).where(eq(embeddings.id, 1))
        })
      )
      expect(rows).toEqual([{ id: 1, embedding }])
    })
  }
)
