import { Transaction } from '@lily/api/kernel/transact'
import {
  type ChatRef,
  StoredRefRepository,
} from '@lily/api/repositories/stored-ref.repository'
import { GCSService } from '@lily/shared/services/file/gcs'
import { GCSDeleteError } from '@lily/shared/services/file/gcs-errors'
import {
  legacyOwnerOf,
  type ObjectScope,
  type StoredObject,
  sameObject,
  scopePrefix,
  userFolder,
} from '@lily/shared/services/file/stored-object'
import { Array, Data, Duration, Effect, Option, pipe, String } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const STORAGE_TIME_LIMIT = Duration.seconds(20)

/**
 * Whose objects a reference may delete. A column a client could once write may
 * point at any object, so a reference only deletes an object its holder owns.
 */
export type Holder = Data.TaggedEnum<{
  Plant: { readonly plantId: string }
  Avatar: { readonly userId: string }
  Chat: { readonly userId: string }
}>

export const Holder = Data.taggedEnum<Holder>()

export interface Held {
  readonly holder: Holder
  readonly ref: string
}

/** What a committed write let go of. */
export interface Release {
  /** Scopes whose every object goes. */
  readonly scopes: ReadonlyArray<ObjectScope>
  /** References the write may have dropped. */
  readonly dropped: ReadonlyArray<Held>
  /** References a row still points at once the write is done. */
  readonly kept: ReadonlyArray<string>
}

const legacyOwnedBy = (key: string, owner: Holder) =>
  Option.exists(legacyOwnerOf(key), (legacy) =>
    Holder.$match(owner, {
      Plant: ({ plantId }) =>
        legacy._tag === 'Plant' && legacy.plantId === plantId,
      Avatar: ({ userId }) =>
        legacy._tag === 'Avatar' && legacy.userId === userId,
      Chat: () => false,
    })
  )

export const holds = (holder: Holder, object: StoredObject): boolean =>
  Holder.$match(holder, {
    Plant: ({ plantId }) =>
      object.bucket === 'plant' &&
      (String.startsWith(scopePrefix({ _tag: 'Plant', plantId }))(object.key) ||
        legacyOwnedBy(object.key, holder)),
    Avatar: ({ userId }) =>
      object.bucket === 'plant' &&
      (String.startsWith(`${userFolder(userId, 'avatars')}/`)(object.key) ||
        legacyOwnedBy(object.key, holder)),
    Chat: ({ userId }) =>
      object.bucket === 'ai' &&
      String.startsWith(`${scopePrefix({ _tag: 'User', userId })}chat/`)(
        object.key
      ),
  })

const withinTimeLimit = (
  effect: Effect.Effect<void, GCSDeleteError>
): Effect.Effect<void, GCSDeleteError> =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: STORAGE_TIME_LIMIT,
      orElse: () =>
        Effect.fail(
          new GCSDeleteError({
            message: `Deleting took longer than ${Duration.format(STORAGE_TIME_LIMIT)}`,
          })
        ),
    })
  )

/**
 * Deletes the objects a committed write let go of. Storage failing does not
 * fail the write: the objects stay until the account purge deletes the
 * owner's scope, and the error is logged with what was left.
 */
export const releaseObjects = ({
  scopes,
  dropped,
  kept,
}: Release): Effect.Effect<void, never, GCSService> =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const stillPointedAt = Array.getSomes(Array.map(kept, gcs.locate))
    const objects = pipe(
      Array.getSomes(
        Array.map(dropped, ({ holder, ref }) =>
          Option.filter(gcs.locate(ref), (object) => holds(holder, object))
        )
      ),
      Array.filter(
        (object) =>
          !Array.some(stillPointedAt, (held) => sameObject(held, object))
      ),
      Array.dedupeWith(sameObject)
    )

    yield* Effect.forEach(
      scopes,
      (scope) =>
        withinTimeLimit(gcs.deleteScope(scope)).pipe(
          Effect.catchTag('GCSDeleteError', (error) =>
            Effect.logError('Could not delete a scope', error).pipe(
              Effect.annotateLogs({ prefix: scopePrefix(scope) })
            )
          )
        ),
      { discard: true }
    )
    if (Array.isReadonlyArrayNonEmpty(objects)) {
      yield* withinTimeLimit(gcs.deleteObjects(objects)).pipe(
        Effect.catchTag('GCSDeleteError', (error) =>
          Effect.logError('Could not delete released objects', error).pipe(
            Effect.annotateLogs({
              objects: Array.map(
                objects,
                ({ bucket, key }) => `${bucket}:${key}`
              ),
            })
          )
        )
      )
    }
  }).pipe(Effect.withSpan('releaseObjects'))

/**
 * Runs `write` in the caller's transaction and, once it commits, deletes the
 * objects behind the references `held` read before it that no row points at
 * any more, along with `scopes`.
 */
export const releasing = <A, E, R>(
  held: Effect.Effect<ReadonlyArray<Held>, SqlError, StoredRefRepository>,
  write: Effect.Effect<A, E, R>,
  scopes: ReadonlyArray<ObjectScope> = []
): Effect.Effect<
  A,
  E | SqlError,
  R | StoredRefRepository | GCSService | Transaction
> =>
  Effect.gen(function* () {
    const refs = yield* StoredRefRepository
    const transaction = yield* Transaction
    const storage = yield* Effect.context<GCSService>()
    const dropped = yield* held
    const result = yield* write
    const kept = yield* refs.stillHeld(Array.map(dropped, ({ ref }) => ref))
    yield* transaction.afterCommit(
      Effect.provide(releaseObjects({ scopes, dropped, kept }), storage)
    )
    return result
  })

const heldBy =
  (holder: Holder) =>
  (refs: ReadonlyArray<string>): ReadonlyArray<Held> =>
    Array.map(refs, (ref) => ({ holder, ref }))

const chatHeld = (refs: ReadonlyArray<ChatRef>): ReadonlyArray<Held> =>
  Array.map(refs, ({ userId, ref }) => ({
    holder: Holder.Chat({ userId }),
    ref,
  }))

export const plantHeld = (plantId: string) =>
  Effect.flatMap(StoredRefRepository, (refs) =>
    Effect.map(refs.ofPlant(plantId), heldBy(Holder.Plant({ plantId })))
  )

export const plantAndChatHeld = (plantId: string) =>
  Effect.flatMap(StoredRefRepository, (refs) =>
    Effect.zipWith(
      plantHeld(plantId),
      Effect.map(refs.chatOfPlant(plantId), chatHeld),
      (plant, chat) => [...plant, ...chat]
    )
  )

export const conversationHeld = (conversationId: string, userId: string) =>
  Effect.flatMap(StoredRefRepository, (refs) =>
    Effect.map(refs.chatOfConversation(conversationId, userId), chatHeld)
  )

/** The user's avatar, locked so a concurrent upload reads the one this replaces. */
export const avatarHeld = (userId: string) =>
  Effect.flatMap(StoredRefRepository, (refs) =>
    Effect.map(
      refs.lockAvatar(userId),
      Option.match({
        onNone: () => [],
        onSome: (ref) => heldBy(Holder.Avatar({ userId }))([ref]),
      })
    )
  )

/** Deletes an upload that no committed row came to point at. */
export const releaseUpload = (holder: Holder, ref: string) =>
  releaseObjects({ scopes: [], dropped: [{ holder, ref }], kept: [] })
