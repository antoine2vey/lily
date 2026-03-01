import type { PlatformError } from '@effect/platform/Error'
import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { nowAsEpochMillis } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import {
  Effect,
  Array as EffectArray,
  String as EffectString,
  Option,
  pipe,
} from 'effect'

export const uploadAvatar = (
  files: readonly PersistedFile[]
): Effect.Effect<
  { url: string },
  | SqlError
  | GCSUploadError
  | GCSConfigError
  | PlatformError
  | MultipleFilesError
  | NoFilesError
  | UserNotFoundError,
  UserRepository | GCSService | FileService | FileSystem | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* UserRepository
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const { id: userId } = yield* CurrentUser

    const file = yield* fileService.getFirstUploadedFile(files)

    const { url } = yield* gcs.uploadFile({
      fileBuffer: Buffer.from(file.buffer),
      fileName: `avatars/${userId}-${nowAsEpochMillis()}.${pipe(
        file.name,
        EffectString.split('.'),
        EffectArray.last,
        Option.getOrElse(() => 'jpg')
      )}`,
      contentType: file.contentType,
    })

    const updated = yield* repo.update(userId, { image: url })

    if (!updated) {
      return yield* Effect.fail(new UserNotFoundError({ userId }))
    }

    return { url }
  }).pipe(Effect.withSpan('UserService.uploadAvatar'))
