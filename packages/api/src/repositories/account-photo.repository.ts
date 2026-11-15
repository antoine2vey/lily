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
import { and, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
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
  /** Of `urls`, those that a row outside the account also points at. */
  readonly findShownElsewhere: (
    userId: string,
    urls: readonly string[]
  ) => Effect.Effect<readonly string[], SqlError>
}

export class AccountPhotoRepository extends Context.Service<
  AccountPhotoRepository,
  IAccountPhotoRepository
>()('AccountPhotoRepository') {}

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

      findShownElsewhere: Effect.fn(
        'AccountPhotoRepository.findShownElsewhere'
      )(function* (userId: string, urls: readonly string[]) {
        if (Array.isReadonlyArrayEmpty(urls)) return []
        const asked = [...urls]
        const notTheirs = or(isNull(plants.userId), ne(plants.userId, userId))

        const plantImages = yield* db
          .select({ ref: plants.imageUrl })
          .from(plants)
          .where(and(inArray(plants.imageUrl, asked), notTheirs))
        const plantPhotoUrls = yield* db
          .select({ ref: plantPhotos.url })
          .from(plantPhotos)
          .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
          .where(and(inArray(plantPhotos.url, asked), notTheirs))
        const carePhotos = yield* db
          .select({ ref: careLogs.photoUrl })
          .from(careLogs)
          .innerJoin(plants, eq(careLogs.plantId, plants.id))
          .where(and(inArray(careLogs.photoUrl, asked), notTheirs))
        const avatars = yield* db
          .select({ ref: users.image })
          .from(users)
          .where(and(inArray(users.image, asked), ne(users.id, userId)))
        const catalogImages = yield* db
          .select({ ref: plantCatalog.imageUrl })
          .from(plantCatalog)
          .where(inArray(plantCatalog.imageUrl, asked))

        return present(
          Array.map(
            [
              ...plantImages,
              ...plantPhotoUrls,
              ...carePhotos,
              ...avatars,
              ...catalogImages,
            ],
            (row) => row.ref
          )
        )
      }),
    }
  })
)
