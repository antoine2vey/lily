import { AccountPhotoRepository } from '@lily/api/repositories/account-photo.repository'
import { GCSService } from '@lily/api/services/file/gcs'
import { GCSDeleteError } from '@lily/api/services/file/gcs-errors'
import {
  legacyOwnerOf,
  legacyStampOf,
  mayNameKey,
  type StoredObject,
  sameObject,
} from '@lily/api/services/file/stored-object'
import { Array, Duration, Effect, Match, Option, Result } from 'effect'

const STORAGE_TIME_LIMIT = Duration.minutes(2)
const IDLE_MARGIN = Duration.seconds(30)

/**
 * Deletes the stored photos of an account that is about to be purged. Run it
 * before the rows go: the rows are what a retry finds the account by.
 *
 * New uploads sit under the user's or the plant's scope and go with it. An
 * older key has no scope, so it goes only when a row of the account points at
 * it. A column the client can write may point at anything, and a reference
 * may name several objects, so an older key is deleted only when it names no
 * other owner and no row outside the account points at it. A reference
 * outside that is too long to read keeps each older key it may name, and the
 * warning lists them.
 *
 * The caller's transaction sits idle while storage answers, so it is allowed
 * to idle for longer than the time limit.
 */
export const eraseAccountPhotos = (userId: string) =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const repo = yield* AccountPhotoRepository
    const refs = yield* repo.findRefs(userId)

    const named = (stored: readonly string[]) =>
      Array.flatMap(stored, (ref) =>
        Option.getOrElse(gcs.readRef(ref), Array.empty<StoredObject>)
      )
    const [uploadedLegacy, uploaded] = Array.partition(
      named(refs.uploaded),
      (object) =>
        Option.isSome(legacyStampOf(object.key))
          ? Result.succeed(object)
          : Result.fail(object)
    )
    const claimed = Array.filter(
      [...uploadedLegacy, ...named(refs.claimed)],
      (object) =>
        Option.match(legacyOwnerOf(object.key), {
          onNone: () => false,
          onSome: (owner) =>
            Match.value(owner).pipe(
              Match.tag('Avatar', (avatar) => avatar.userId === userId),
              Match.tag('Plant', ({ plantId }) =>
                Array.contains(refs.plantIds, plantId)
              ),
              Match.tag('Unnamed', () => true),
              Match.exhaustive
            ),
        })
    )
    const stamps = Array.dedupe(
      Array.getSomes(Array.map(claimed, ({ key }) => legacyStampOf(key)))
    )
    const [readOutside, unreadable] = Array.partition(
      yield* repo.findRefsOutside(userId, stamps),
      (ref) => Result.fromOption(gcs.readRef(ref), () => ref)
    )
    const heldOutside = Array.flatten(readOutside)
    const notHeldOutside = Array.filter(
      claimed,
      (object) => !Array.some(heldOutside, (held) => sameObject(held, object))
    )
    const mayBeNamed = ({ key }: StoredObject) =>
      Array.some(unreadable, (ref) => mayNameKey(ref)(key))
    const [mayBeHeld, proven] = Array.partition(notHeldOutside, (object) =>
      mayBeNamed(object) ? Result.succeed(object) : Result.fail(object)
    )
    if (Array.isReadonlyArrayNonEmpty(mayBeHeld)) {
      yield* Effect.logWarning(
        'Kept older photos that a reference too long to read may name'
      ).pipe(
        Effect.annotateLogs({
          unreadable: unreadable.length,
          objects: Array.map(
            mayBeHeld,
            ({ bucket, key }) => `${bucket}:${key}`
          ),
        })
      )
    }

    yield* repo.allowIdleInTransaction(
      Duration.sum(STORAGE_TIME_LIMIT, IDLE_MARGIN)
    )
    yield* Effect.gen(function* () {
      yield* gcs.deleteScope({ _tag: 'User', userId })
      yield* Effect.forEach(
        refs.plantIds,
        (plantId) => gcs.deleteScope({ _tag: 'Plant', plantId }),
        { concurrency: 5, discard: true }
      )
      yield* gcs.deleteObjects(
        Array.dedupeWith([...uploaded, ...proven], sameObject)
      )
    }).pipe(
      Effect.timeoutOrElse({
        duration: STORAGE_TIME_LIMIT,
        orElse: () =>
          Effect.fail(
            new GCSDeleteError({
              message: `Deleting the photos took longer than ${Duration.format(STORAGE_TIME_LIMIT)}`,
            })
          ),
      })
    )
  }).pipe(
    Effect.withSpan('eraseAccountPhotos', { attributes: { 'user.id': userId } })
  )
