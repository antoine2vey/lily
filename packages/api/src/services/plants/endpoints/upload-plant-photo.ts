import type { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import { type PrismaError, PrismaService } from '@lily/db'
import {
  FileService,
  type MultipleFilesError,
  type NoFilesError,
} from '@lily/shared/services/file/fileservice'
import { GCSService, type GCSUploadError } from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

export const uploadPlantPhoto = ({
  plantId,
  files,
}: {
  plantId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  void,
  PrismaError | GCSUploadError | MultipleFilesError | NoFilesError,
  PrismaService | FileService | GCSService | FileSystem
> => {
  return Effect.gen(function* () {
    const prisma = yield* PrismaService
    const gcs = yield* GCSService
    const fileService = yield* FileService
    const urls: string[] = []

    for (const file of files) {
      const fileBuffer = yield* fileService.getFirstUploadedFile(files)

      const { url } = yield* gcs.uploadFile({
        fileBuffer: Buffer.from(fileBuffer.buffer),
        fileName: file.name,
        contentType: file.contentType,
      })

      urls.push(url)
    }

    yield* prisma.plantPhoto.createMany({
      data: urls.map((url) => ({
        plantId,
        url,
        takenAt: new Date(),
      })),
    })
  })
}
