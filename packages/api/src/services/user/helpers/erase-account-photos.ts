import { AccountPhotoRepository } from '@lily/api/repositories/account-photo.repository'
import { GCSService } from '@lily/shared/services/file/gcs'
import { GCSDeleteError } from '@lily/shared/services/file/gcs-errors'
import { legacyOwnerOf } from '@lily/shared/services/file/stored-object'
import { Array, Effect, Match, Option } from 'effect'

const STORAGE_TIME_LIMIT = '2 minutes'

/**
 * Deletes the stored photos of an account that is about to be purged. Run it
 * before the rows go: the rows are what a retry finds the account by.
 *
 * New uploads sit under the user's or the plant's scope and go with it. An
 * older key has no scope, so it goes only when a row of the account points at
 * it. A column the client can write may point at anything, so its object is
 * deleted only when it is an older upload that names no other owner and that
 * no row outside the account shows.
 */
export const eraseAccountPhotos = (userId: string) =>
  Effect.gen(function* () {
    const gcs = yield* GCSService
    const repo = yield* AccountPhotoRepository
    const refs = yield* repo.findRefs(userId)

    const located = (stored: readonly string[]) =>
      Array.getSomes(
        Array.map(stored, (ref) =>
          Option.map(gcs.locate(ref), (object) => ({ ref, object }))
        )
      )
    const claimed = Array.getSomes(
      Array.map(located(refs.claimed), (photo) =>
        Option.map(legacyOwnerOf(photo.object.key), (owner) => ({
          ...photo,
          owner,
        }))
      )
    )
    const unclaimedByOthers = Array.filter(claimed, ({ owner }) =>
      Match.value(owner).pipe(
        Match.tag('Avatar', (avatar) => avatar.userId === userId),
        Match.tag('Plant', ({ plantId }) =>
          Array.contains(refs.plantIds, plantId)
        ),
        Match.tag('Unnamed', () => true),
        Match.exhaustive
      )
    )
    const shownElsewhere = yield* repo.findShownElsewhere(
      userId,
      Array.map(unclaimedByOthers, ({ ref }) => ref)
    )
    const proven = Array.filter(
      unclaimedByOthers,
      ({ ref }) => !Array.contains(shownElsewhere, ref)
    )

    yield* gcs.deleteScope({ _tag: 'User', userId })
    yield* Effect.forEach(
      refs.plantIds,
      (plantId) => gcs.deleteScope({ _tag: 'Plant', plantId }),
      { concurrency: 5, discard: true }
    )
    yield* gcs.deleteObjects(
      Array.map([...located(refs.uploaded), ...proven], ({ object }) => object)
    )
  }).pipe(
    Effect.timeoutOrElse({
      duration: STORAGE_TIME_LIMIT,
      orElse: () =>
        Effect.fail(
          new GCSDeleteError({
            message: `Deleting the photos took longer than ${STORAGE_TIME_LIMIT}`,
          })
        ),
    }),
    Effect.withSpan('eraseAccountPhotos', { attributes: { 'user.id': userId } })
  )
