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
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/** A chat image reference and the user whose chat folder it may sit in. */
export interface ChatRef {
  readonly userId: string
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
  /** The references in `refs` that a row still points at. */
  readonly stillHeld: (
    refs: readonly string[]
  ) => Effect.Effect<string[], SqlError>
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
        refs: readonly string[]
      ) {
        if (Array.isReadonlyArrayEmpty(refs)) return []
        const wanted = [...refs]
        const held = [
          ...(yield* db
            .select({ ref: plants.imageUrl })
            .from(plants)
            .where(inArray(plants.imageUrl, wanted))),
          ...(yield* db
            .select({ ref: plantPhotos.url })
            .from(plantPhotos)
            .where(inArray(plantPhotos.url, wanted))),
          ...(yield* db
            .select({ ref: careLogs.photoUrl })
            .from(careLogs)
            .where(inArray(careLogs.photoUrl, wanted))),
          ...(yield* db
            .select({ ref: users.image })
            .from(users)
            .where(inArray(users.image, wanted))),
          ...(yield* db
            .select({ ref: plantCatalog.imageUrl })
            .from(plantCatalog)
            .where(inArray(plantCatalog.imageUrl, wanted))),
          ...(yield* db
            .select({ ref: chatMessages.imageKey })
            .from(chatMessages)
            .where(inArray(chatMessages.imageKey, wanted))),
          ...(yield* db
            .select({ ref: diagnoses.imageKey })
            .from(diagnoses)
            .where(inArray(diagnoses.imageKey, wanted))),
        ]
        return Array.dedupe(refsOf(held))
      }),
    }
  })
)
