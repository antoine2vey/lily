import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careLogs,
  chatConversations,
  chatMessages,
  diagnoses,
  plantCatalog,
  plantPhotos,
  plants,
  users,
} from '@lily/db/schema'
import {
  KEY_DISGUISE,
  type StoredObject,
  searchRunOf,
} from '@lily/shared/services/file/stored-object'
import { and, type Column, eq, isNotNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, Stream } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

/** A chat image reference and the user whose chat folder it may sit in. */
export interface ChatRef {
  readonly userId: string
  readonly ref: string
}

/** A column that can point at a stored object. */
export type RefSource =
  | 'plants.image_url'
  | 'plant_photos.url'
  | 'care_logs.photo_url'
  | 'users.image'
  | 'plant_catalog.image_url'
  | 'chat_messages.image_key'
  | 'chat_messages.parts'
  | 'diagnoses.image_key'
  | 'rare_plant_identifications.image_url'

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
        const patterns = sql.join(
          Array.map(
            Array.dedupe(Array.map(objects, ({ key }) => searchRunOf(key))),
            (run) => sql`${`%${run}%`}`
          ),
          sql`, `
        )
        const mayName = (column: Column) =>
          sql<boolean>`(${column} like any (array[${patterns}]::text[]) or ${column} ~ ${KEY_DISGUISE.unsafe} or (strpos(${column}, '%') > 0 and ${column} ~ ${KEY_DISGUISE.escape}))`
        const held = [
          ...(yield* db
            .select({ ref: plants.imageUrl })
            .from(plants)
            .where(mayName(plants.imageUrl))),
          ...(yield* db
            .select({ ref: plantPhotos.url })
            .from(plantPhotos)
            .where(mayName(plantPhotos.url))),
          ...(yield* db
            .select({ ref: careLogs.photoUrl })
            .from(careLogs)
            .where(mayName(careLogs.photoUrl))),
          ...(yield* db
            .select({ ref: users.image })
            .from(users)
            .where(mayName(users.image))),
          ...(yield* db
            .select({ ref: plantCatalog.imageUrl })
            .from(plantCatalog)
            .where(mayName(plantCatalog.imageUrl))),
          ...(yield* db
            .select({ ref: chatMessages.imageKey })
            .from(chatMessages)
            .where(mayName(chatMessages.imageKey))),
          ...(yield* db
            .select({ ref: diagnoses.imageKey })
            .from(diagnoses)
            .where(mayName(diagnoses.imageKey))),
        ]
        return Array.dedupe(refsOf(held))
      }),

      everyRef: client<StoredRef>`
        SELECT 'plants.image_url' AS source, image_url AS ref
          FROM plants WHERE image_url IS NOT NULL
        UNION ALL SELECT 'plant_photos.url', url FROM plant_photos
        UNION ALL SELECT 'care_logs.photo_url', photo_url
          FROM care_logs WHERE photo_url IS NOT NULL
        UNION ALL SELECT 'users.image', image FROM users WHERE image IS NOT NULL
        UNION ALL SELECT 'plant_catalog.image_url', image_url
          FROM plant_catalog WHERE image_url IS NOT NULL
        UNION ALL SELECT 'chat_messages.image_key', image_key
          FROM chat_messages WHERE image_key IS NOT NULL
        UNION ALL SELECT 'chat_messages.parts', part #>> '{}'
          FROM chat_messages,
            jsonb_path_query(parts, '$[*] ? (@.type == "file").url') AS part
          WHERE jsonb_typeof(part) = 'string'
        UNION ALL SELECT 'diagnoses.image_key', image_key
          FROM diagnoses WHERE image_key IS NOT NULL
        UNION ALL SELECT 'rare_plant_identifications.image_url', image_url
          FROM rare_plant_identifications
      `.stream.pipe(Stream.withSpan('StoredRefRepository.everyRef')),
    }
  })
)
