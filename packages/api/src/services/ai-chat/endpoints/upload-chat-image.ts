import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { nowAsEpochMillis } from '@lily/shared'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Array, Effect, pipe, String } from 'effect'

export const uploadChatImage = ({
  conversationId,
  files,
}: {
  conversationId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  { imageUrl: string; imageKey: string },
  GCSUploadError | GCSConfigError | PlatformError,
  GCSService | FileSystem | CurrentUser
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService

    const file = yield* Array.head(files)
    const buffer = yield* fileSystem.readFile(file.path)

    const timestamp = nowAsEpochMillis()
    const name = pipe(
      file.name,
      String.replaceAll('..', ''),
      String.split('/'),
      Array.last
    )
    const safeName = yield* name
    const fileName = `chat/${conversationId}/${timestamp}-${safeName}`

    const { key } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(buffer),
      fileName,
      contentType: file.contentType,
    })

    const signedUrl = yield* gcs.getSignedUrl(key)

    return { imageUrl: signedUrl, imageKey: key }
  }).pipe(
    Effect.withSpan('AIChatService.uploadChatImage', {
      attributes: { 'conversation.id': conversationId },
    })
  )
