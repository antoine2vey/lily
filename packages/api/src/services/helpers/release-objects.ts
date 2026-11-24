import { Transaction } from '@lily/api/kernel/transact'
import {
  type ChatRef,
  StoredRefRepository,
} from '@lily/api/repositories/stored-ref.repository'
import { GCSService } from '@lily/api/services/file/gcs'
import { GCSDeleteError } from '@lily/api/services/file/gcs-errors'
import {
  legacyOwnerOf,
  mayNameKey,
  type ObjectScope,
  type readStoredRef,
  type StoredObject,
  sameObject,
  scopePrefix,
  userFolder,
} from '@lily/api/services/file/stored-object'
import {
  Array,
  Data,
  Duration,
  Effect,
  Option,
  Predicate,
  pipe,
  Result,
  String,
} from 'effect'
import { isSqlError, type SqlError } from 'effect/sql/SqlError'

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
  /** References on rows that may still name a dropped object. */
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

/** The objects `ref` may name that its holder owns. */
const releasable =
  (read: ReturnType<typeof readStoredRef>) =>
  ({ holder, ref }: Held): ReadonlyArray<StoredObject> =>
    Option.match(read(ref), {
      onNone: () => [],
      onSome: Array.filter((object) => holds(holder, object)),
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
 * owner's scope, and the error is logged with what was left. Nothing storage
 * does may fail the caller, whose write is already committed, so a defect of
 * the storage client is logged here as well. An object a kept reference too
 * long to read may name stays, and the warning lists it.
 */
export const releaseObjects = ({
  scopes,
  dropped,
  kept,
}: Release): Effect.Effect<void, never, GCSService> =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const [named, unreadable] = Array.partition(kept, (ref) =>
      Result.fromOption(gcs.readRef(ref), () => ref)
    )
    const stillNamed = Array.flatten(named)
    const released = pipe(
      Array.flatMap(dropped, releasable(gcs.readRef)),
      Array.filter(
        (object) => !Array.some(stillNamed, (held) => sameObject(held, object))
      ),
      Array.dedupeWith(sameObject)
    )
    const mayStillBeNamed = ({ key }: StoredObject) =>
      Array.some(unreadable, (ref) => mayNameKey(ref)(key))
    const blocked = Array.filter(released, mayStillBeNamed)
    const objects = Array.filter(released, Predicate.not(mayStillBeNamed))
    if (Array.isReadonlyArrayNonEmpty(blocked)) {
      yield* Effect.logWarning(
        'Kept released objects that a reference too long to read may name'
      ).pipe(
        Effect.annotateLogs({
          unreadable: unreadable.length,
          objects: Array.map(blocked, ({ bucket, key }) => `${bucket}:${key}`),
        })
      )
    }

    const deleteScopes = Array.map(scopes, (scope) =>
      withinTimeLimit(gcs.deleteScope(scope)).pipe(
        Effect.catchTag('GCSDeleteError', (error) =>
          Effect.logError('Could not delete a scope', error).pipe(
            Effect.annotateLogs({ prefix: scopePrefix(scope) })
          )
        )
      )
    )
    const deleteObjects = Array.isReadonlyArrayNonEmpty(objects)
      ? withinTimeLimit(gcs.deleteObjects(objects)).pipe(
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
      : Effect.void

    yield* Effect.all([...deleteScopes, deleteObjects], {
      concurrency: 'unbounded',
      discard: true,
    })
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.logError('Releasing stored objects died', defect)
    ),
    Effect.withSpan('releaseObjects')
  )

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
    const gcs = yield* GCSService
    const dropped = yield* held
    const result = yield* write
    const kept = yield* refs.stillHeld(
      Array.flatMap(dropped, releasable(gcs.readRef))
    )
    yield* transaction.afterCommit(releaseObjects({ scopes, dropped, kept }))
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

/**
 * Deletes the upload behind `ref` when `write`, which would have stored the
 * reference, is refused. A `SqlError` keeps the upload: it can come from a
 * commit that went through without an answer, and then a row points at the
 * object. An object no row points at can be swept later, and a row that
 * points at a deleted object cannot be repaired.
 */
export const releasingRefusedUpload =
  (holder: Holder, ref: string) =>
  <A, E, R>(
    write: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R | GCSService> =>
    Effect.tapError(write, (error) =>
      isSqlError(error)
        ? Effect.void
        : releaseObjects({ scopes: [], dropped: [{ holder, ref }], kept: [] })
    )
