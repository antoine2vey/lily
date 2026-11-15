import { AccountPhotoRepository } from '@lily/api/repositories/account-photo.repository'
import { GCSService } from '@lily/shared/services/file/gcs'
import { GCSDeleteError } from '@lily/shared/services/file/gcs-errors'
import {
  legacyOwnerOf,
  legacyStampOf,
  sameObject,
} from '@lily/shared/services/file/stored-object'
import { Array, Duration, Effect, Match, Option } from 'effect'

const STORAGE_TIME_LIMIT = Duration.minutes(2)
const IDLE_MARGIN = Duration.seconds(30)

/**
 * Deletes the stored photos of an account that is about to be purged. Run it
 * before the rows go: the rows are what a retry finds the account by.
 *
 * New uploads sit under the user's or the plant's scope and go with it. An
 * older key has no scope, so it goes only when a row of the account points at
 * it. A column the client can write may point at anything, so its object is
 * deleted only when it is an older upload that names no other owner and that
 * no row outside the account points at.
 *
 * The caller's transaction sits idle while storage answers, so it is allowed
 * to idle for longer than the time limit.
 */
export const eraseAccountPhotos = (userId: string) =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const repo = yield* AccountPhotoRepository
    const refs = yield* repo.findRefs(userId)

    const located = (stored: readonly string[]) =>
      Array.getSomes(Array.map(stored, gcs.locate))
    const claimed = Array.filter(located(refs.claimed), (object) =>
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
    const heldOutside = located(yield* repo.findRefsOutside(userId, stamps))
    const proven = Array.filter(
      claimed,
      (object) => !Array.some(heldOutside, (held) => sameObject(held, object))
    )

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
      yield* gcs.deleteObjects([...located(refs.uploaded), ...proven])
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
