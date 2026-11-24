import { transactQuietly } from '@lily/api/kernel/transact'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/api/services/file/fileservice'
import { GCSService } from '@lily/api/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/api/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/api/services/file/image-upload'
import { userFolder } from '@lily/api/services/file/stored-object'
import {
  avatarHeld,
  Holder,
  releasing,
  releasingRefusedUpload,
} from '@lily/api/services/helpers/release-objects'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const uploadAvatar = (
  files: readonly PersistedFile[]
): Effect.Effect<
  { url: string },
  | SqlError
  | GCSUploadError
  | InvalidImageError
  | GCSConfigError
  | PlatformError
  | MultipleFilesError
  | NoFilesError
  | UserNotFoundError,
  | UserRepository
  | StoredRefRepository
  | GCSService
  | FileService
  | FileSystem
  | CurrentUser
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const { id: userId } = yield* CurrentUser

    const file = yield* fileService.getFirstUploadedFile(files)

    const { url } = yield* gcs.uploadFile({
      fileBuffer: Buffer.from(file.buffer),
      folder: userFolder(userId, 'avatars'),
    })

    yield* transactQuietly(
      releasing(
        avatarHeld(userId),
        Effect.gen(function* () {
          const updated = yield* repo.update(userId, { image: url })
          if (!updated) {
            return yield* new UserNotFoundError({ userId })
          }
        })
      )
    ).pipe(releasingRefusedUpload(Holder.Avatar({ userId }), url))

    return { url }
  }).pipe(Effect.withSpan('UserService.uploadAvatar'))
