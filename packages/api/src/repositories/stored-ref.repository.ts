import * as PgDrizzle from '@lily/db/effect-drizzle'
import type * as schema from '@lily/db/schema'
import {
  careLogs,
  chatConversations,
  chatMessages,
  diagnoses,
  isStoredRefColumn,
  JSON_REF_HOLDERS,
  plantPhotos,
  plants,
  users,
} from '@lily/db/schema'
import { SCHEMA_COLUMNS } from '@lily/db/schema-columns'
import {
  KEY_DISGUISE,
  type StoredObject,
  type StoredObjectRef,
  searchRunOf,
} from '@lily/shared/services/file/stored-object'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { Array, Context, Effect, Layer, Option, Record, Stream } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/** A chat image reference and the user whose chat folder it may sit in. */
export interface ChatRef {
  readonly userId: string
  readonly ref: string
}

type Schema = typeof schema

type StoredRefColumnOf<T> = T extends PgTable
  ? {
      [K in keyof T['_']['columns']]: T['_']['columns'][K]['_']['data'] extends StoredObjectRef
        ? `${T['_']['name']}.${T['_']['columns'][K]['_']['name']}`
        : never
    }[keyof T['_']['columns']]
  : never

type JsonRefHolder = (typeof JSON_REF_HOLDERS)[number]

/** A column that can point at a stored object, as `table.column`. */
export type RefSource =
  | { [K in keyof Schema]: StoredRefColumnOf<Schema[K]> }[keyof Schema]
  | `${JsonRefHolder['table']}.${JsonRefHolder['column']}`

/**
 * Each column that can point at a stored object, as the query of the
 * references it holds: every `storedRef()` column and every jsonb holder of
 * `JSON_REF_HOLDERS`. The orphan sweep and the release check both read it, so
 * an object a row holds is never swept nor released.
 *
 * `RefSource` reads the same `storedRef()` columns from the types.
 * `stored-refs.integration.test.ts` writes a row for each `RefSource` and fails
 * when this list does not read it.
 */
export const REF_HOLDERS = Record.fromEntries([
  ...Array.map(
    Array.filter(SCHEMA_COLUMNS, ({ column }) => isStoredRefColumn(column)),
    ({ table, column }) =>
      [
        `${table}.${column.name}`,
        `SELECT ${column.name} FROM ${table}`,
      ] as const
  ),
  ...Array.map(
    JSON_REF_HOLDERS,
    ({ table, column, path }) =>
      [
        `${table}.${column}`,
        `SELECT part #>> '{}' FROM ${table},
          jsonb_path_query(${column}, '${path}') AS part
          WHERE jsonb_typeof(part) = 'string'`,
      ] as const
  ),
]) as Record<RefSource, string>

/** Every reference a row holds, with the column that holds it. */
const HELD_REFS = Array.join(
  Array.map(
    Record.toEntries(REF_HOLDERS),
    ([source, select]) =>
      `SELECT '${source}' AS source, ref FROM (${select}) AS holder(ref) WHERE ref IS NOT NULL`
  ),
  ' UNION ALL '
)

export interface StoredRef {
  readonly source: RefSource
  readonly ref: string
}

export interface IStoredRefRepository {
  readonly ofPlant: (plantId: string) => Effect.Effect<string[], SqlError>
  /**
   * The images of every conversation about the plant, whoever had it, and of
   * the plant's diagnoses.
   */
  readonly chatOfPlant: (plantId: string) => Effect.Effect<ChatRef[], SqlError>
  /** The images of the conversation, when `userId` has it. */
  readonly chatOfConversation: (
    conversationId: string,
    userId: string
  ) => Effect.Effect<ChatRef[], SqlError>
  /** The user's avatar, with the user row locked until the transaction ends. */
  readonly lockAvatar: (
    userId: string
  ) => Effect.Effect<Option.Option<string>, SqlError>
  /**
   * The references on rows that may name one of `objects`. A row is found by
   * text, so the caller reads each reference to learn what it names.
   */
  readonly stillHeld: (
    objects: readonly StoredObject[]
  ) => Effect.Effect<string[], SqlError>
  /**
   * Every reference any row holds, streamed so no table is read into memory.
   * `chat_messages.parts` yields the url of each file part, because
   * `image_key` keeps only the first image of a message.
   */
  readonly everyRef: Stream.Stream<StoredRef, SqlError>
}

export class StoredRefRepository extends Context.Service<
  StoredRefRepository,
  IStoredRefRepository
>()('StoredRefRepository') {}

const present = <A>(values: readonly (A | null)[]): A[] =>
  Array.getSomes(Array.map(values, Option.fromNullishOr))

const refsOf = (rows: readonly { ref: string | null }[]) =>
  present(Array.map(rows, (row) => row.ref))

const chatRefsOf = (rows: readonly { userId: string; ref: string | null }[]) =>
  Array.getSomes(
    Array.map(rows, ({ userId, ref }) =>
      Option.map(Option.fromNullishOr(ref), (held) => ({ userId, ref: held }))
    )
  )

export const StoredRefRepositoryLive = Layer.effect(
  StoredRefRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const client = yield* SqlClient.SqlClient

    return {
      ofPlant: Effect.fn('StoredRefRepository.ofPlant')(function* (
        plantId: string
      ) {
        const image = yield* db
          .select({ ref: plants.imageUrl })
          .from(plants)
          .where(eq(plants.id, plantId))
        const photos = yield* db
          .select({ ref: plantPhotos.url })
          .from(plantPhotos)
          .where(eq(plantPhotos.plantId, plantId))
        const carePhotos = yield* db
          .select({ ref: careLogs.photoUrl })
          .from(careLogs)
          .where(
            and(eq(careLogs.plantId, plantId), isNotNull(careLogs.photoUrl))
          )
        return [...refsOf(image), ...refsOf(photos), ...refsOf(carePhotos)]
      }),

      chatOfPlant: Effect.fn('StoredRefRepository.chatOfPlant')(function* (
        plantId: string
      ) {
        const messages = yield* db
          .select({
            userId: chatConversations.userId,
            ref: chatMessages.imageKey,
          })
          .from(chatMessages)
          .innerJoin(
            chatConversations,
            eq(chatMessages.conversationId, chatConversations.id)
          )
          .where(
            and(
              eq(chatConversations.plantId, plantId),
              isNotNull(chatMessages.imageKey)
            )
          )
        const diagnosed = yield* db
          .select({ userId: diagnoses.userId, ref: diagnoses.imageKey })
          .from(diagnoses)
          .where(
            and(eq(diagnoses.plantId, plantId), isNotNull(diagnoses.imageKey))
          )
        return [...chatRefsOf(messages), ...chatRefsOf(diagnosed)]
      }),

      chatOfConversation: Effect.fn('StoredRefRepository.chatOfConversation')(
        function* (conversationId: string, userId: string) {
          const messages = yield* db
            .select({
              userId: chatConversations.userId,
              ref: chatMessages.imageKey,
            })
            .from(chatMessages)
            .innerJoin(
              chatConversations,
              eq(chatMessages.conversationId, chatConversations.id)
            )
            .where(
              and(
                eq(chatConversations.id, conversationId),
                eq(chatConversations.userId, userId),
                isNotNull(chatMessages.imageKey)
              )
            )
          return chatRefsOf(messages)
        }
      ),

      lockAvatar: Effect.fn('StoredRefRepository.lockAvatar')(function* (
        userId: string
      ) {
        const rows = yield* db
          .select({ ref: users.image })
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
        return Array.head(refsOf(rows))
      }),

      stillHeld: Effect.fn('StoredRefRepository.stillHeld')(function* (
        objects: readonly StoredObject[]
      ) {
        if (Array.isReadonlyArrayEmpty(objects)) return []
        const patterns = Array.map(
          Array.dedupe(Array.map(objects, ({ key }) => searchRunOf(key))),
          (run) => client`${`%${run}%`}`
        )
        const held = yield* client<{ ref: string }>`
          SELECT DISTINCT ref FROM (${client.literal(HELD_REFS)}) AS held
          WHERE ref LIKE ANY (ARRAY[${client.csv(patterns)}]::text[])
            OR ref ~ ${KEY_DISGUISE.unsafe}
            OR (strpos(ref, '%') > 0 AND ref ~ ${KEY_DISGUISE.escape})
        `
        return Array.map(held, ({ ref }) => ref)
      }),

      everyRef: client<StoredRef>`${client.literal(HELD_REFS)}`.stream.pipe(
        Stream.withSpan('StoredRefRepository.everyRef')
      ),
    }
  })
)
