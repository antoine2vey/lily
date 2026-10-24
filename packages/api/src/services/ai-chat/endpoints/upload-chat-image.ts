import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Array, Effect } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'

export const uploadChatImage = ({
  conversationId,
  files,
}: {
  conversationId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  { imageUrl: string; imageKey: string },
  GCSUploadError | InvalidImageError | GCSConfigError | PlatformError,
  GCSService | FileSystem | CurrentUser
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService

    const file = yield* Effect.fromOption(Array.head(files)).pipe(Effect.orDie)
    const buffer = yield* fileSystem.readFile(file.path)

    const { key } = yield* gcs.uploadPrivateFile({
      fileBuffer: Buffer.from(buffer),
      folder: `chat/${conversationId}`,
    })

    const signedUrl = yield* gcs.getSignedUrl(key)

    return { imageUrl: signedUrl, imageKey: key }
  }).pipe(
    Effect.withSpan('AIChatService.uploadChatImage', {
      attributes: { 'conversation.id': conversationId },
    })
  )
