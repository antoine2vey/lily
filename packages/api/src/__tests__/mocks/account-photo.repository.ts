import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import {
  type AccountPhotoRefs,
  AccountPhotoRepository,
} from '@lily/api/repositories/account-photo.repository'
import { Effect, Layer } from 'effect'

export const createMockAccountPhotoRepository = (
  refs: AccountPhotoRefs = { plantIds: [], uploaded: [], claimed: [] }
): Layer.Layer<AccountPhotoRepository> =>
  Layer.succeed(AccountPhotoRepository, {
    findRefs: () => Effect.succeed(refs),
    findRefsOutside: () => Effect.succeed([]),
    allowIdleInTransaction: () => Effect.void,
  })

/** What `purgeAccount` needs from storage when the account has no photos. */
export const NoStoredPhotosLive = Layer.mergeAll(
  createMockAccountPhotoRepository(),
  createMockGCSService()
)
