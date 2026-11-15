import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careLogs,
  chatMessages,
  diagnoses,
  plantCatalog,
  plantPhotos,
  plants,
  users,
} from '@lily/db/schema'
import {
  and,
  type Column,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { Array, Context, Duration, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/** The photo references on the rows that an account's deletion cascades to. */
export interface AccountPhotoRefs {
  /** The plants the user owns. A canopy's plants are not among them. */
  readonly plantIds: readonly string[]
  /** Written by the server after an upload: plant photos, chat and diagnosis images. */
  readonly uploaded: readonly string[]
  /** Columns a client can set to any URL: avatar, plant image, care photo. */
  readonly claimed: readonly string[]
}

export interface IAccountPhotoRepository {
  readonly findRefs: (
    userId: string
  ) => Effect.Effect<AccountPhotoRefs, SqlError>
  /**
   * Every photo reference on a row outside the account that may spell a key
   * with one of `stamps`. The caller locates each one: a URL has many
   * spellings, so only located objects compare.
   */
  readonly findRefsOutside: (
    userId: string,
    stamps: readonly string[]
  ) => Effect.Effect<readonly string[], SqlError>
  /** Lets the current transaction sit idle for `duration` while storage answers. */
  readonly allowIdleInTransaction: (
    duration: Duration.Duration
  ) => Effect.Effect<void, SqlError>
}

export class AccountPhotoRepository extends Context.Service<
  AccountPhotoRepository,
  IAccountPhotoRepository
>()('AccountPhotoRepository') {}

// A URL that percent-encodes a digit hides the stamp from a `like`.
const ENCODED_DIGIT = '%3[0-9]'

const present = <A>(values: readonly (A | null)[]): A[] =>
  Array.getSomes(Array.map(values, Option.fromNullishOr))

export const AccountPhotoRepositoryLive = Layer.effect(
  AccountPhotoRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findRefs: Effect.fn('AccountPhotoRepository.findRefs')(function* (
        userId: string
      ) {
        const owned = yield* db
          .select({ id: plants.id, imageUrl: plants.imageUrl })
          .from(plants)
          .where(eq(plants.userId, userId))
        const plantIds = Array.map(owned, (plant) => plant.id)

        const avatars = yield* db
          .select({ ref: users.image })
          .from(users)
          .where(eq(users.id, userId))
        const chatImages = yield* db
          .select({ ref: chatMessages.imageKey })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.userId, userId),
              isNotNull(chatMessages.imageKey)
            )
          )
        const diagnosisImages = yield* db
          .select({ ref: diagnoses.imageKey })
          .from(diagnoses)
          .where(
            and(
              isNotNull(diagnoses.imageKey),
              or(
                eq(diagnoses.userId, userId),
                inArray(diagnoses.plantId, plantIds)
              )
            )
          )
        const plantPhotoUrls = yield* db
          .select({ ref: plantPhotos.url })
          .from(plantPhotos)
          .where(inArray(plantPhotos.plantId, plantIds))
        const carePhotos = yield* db
          .select({ ref: careLogs.photoUrl })
          .from(careLogs)
          .where(
            and(
              inArray(careLogs.plantId, plantIds),
              isNotNull(careLogs.photoUrl)
            )
          )

        const refsOf = (rows: readonly { ref: string | null }[]) =>
          present(Array.map(rows, (row) => row.ref))

        return {
          plantIds,
          uploaded: [
            ...refsOf(plantPhotoUrls),
            ...refsOf(chatImages),
            ...refsOf(diagnosisImages),
          ],
          claimed: [
            ...refsOf(avatars),
            ...present(Array.map(owned, (plant) => plant.imageUrl)),
            ...refsOf(carePhotos),
          ],
        }
      }),

      findRefsOutside: Effect.fn('AccountPhotoRepository.findRefsOutside')(
        function* (userId: string, stamps: readonly string[]) {
          if (Array.isReadonlyArrayEmpty(stamps)) return []
          const patterns = sql.join(
            Array.map(stamps, (stamp) => sql`${`%${stamp}%`}`),
            sql`, `
          )
          const maySpell = (column: Column) =>
            sql<boolean>`(${column} like any (array[${patterns}]::text[]) or ${column} ~ ${ENCODED_DIGIT})`
          const notTheirPlant = or(
            isNull(plants.userId),
            ne(plants.userId, userId)
          )

          const plantImages = yield* db
            .select({ ref: plants.imageUrl })
            .from(plants)
            .where(and(maySpell(plants.imageUrl), notTheirPlant))
          const plantPhotoUrls = yield* db
            .select({ ref: plantPhotos.url })
            .from(plantPhotos)
            .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
            .where(and(maySpell(plantPhotos.url), notTheirPlant))
          const carePhotos = yield* db
            .select({ ref: careLogs.photoUrl })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(and(maySpell(careLogs.photoUrl), notTheirPlant))
          const avatars = yield* db
            .select({ ref: users.image })
            .from(users)
            .where(and(maySpell(users.image), ne(users.id, userId)))
          const catalogImages = yield* db
            .select({ ref: plantCatalog.imageUrl })
            .from(plantCatalog)
            .where(maySpell(plantCatalog.imageUrl))
          const chatImages = yield* db
            .select({ ref: chatMessages.imageKey })
            .from(chatMessages)
            .where(
              and(
                maySpell(chatMessages.imageKey),
                ne(chatMessages.userId, userId)
              )
            )
          const diagnosisImages = yield* db
            .select({ ref: diagnoses.imageKey })
            .from(diagnoses)
            .innerJoin(plants, eq(diagnoses.plantId, plants.id))
            .where(
              and(
                maySpell(diagnoses.imageKey),
                ne(diagnoses.userId, userId),
                notTheirPlant
              )
            )

          return present(
            Array.map(
              [
                ...plantImages,
                ...plantPhotoUrls,
                ...carePhotos,
                ...avatars,
                ...catalogImages,
                ...chatImages,
                ...diagnosisImages,
              ],
              (row) => row.ref
            )
          )
        }
      ),

      allowIdleInTransaction: Effect.fn(
        'AccountPhotoRepository.allowIdleInTransaction'
      )(function* (duration: Duration.Duration) {
        yield* db.execute(
          sql`select set_config('idle_in_transaction_session_timeout', ${`${Duration.toMillis(duration)}`}, true)`
        )
      }),
    }
  })
)
