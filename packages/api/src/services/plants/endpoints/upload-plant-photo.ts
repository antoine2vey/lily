import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import { type PrismaError, PrismaService } from '@lily/db'

import {
  type GCSConfigError,
  GCSService,
  type GCSUploadError,
} from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'

export const uploadPlantPhoto = ({
  plantId,
  files,
}: {
  plantId: string
  files: readonly PersistedFile[]
}): Effect.Effect<
  void,
  PrismaError | GCSUploadError | GCSConfigError,
  PrismaService | GCSService | FileSystem
> => {
  return Effect.gen(function* () {
    const prisma = yield* PrismaService
    const fileSystem = yield* FileSystem
    const gcs = yield* GCSService
    const urls: string[] = []

    for (const file of files) {
      const buffer = yield* fileSystem.readFile(file.path)

      const { url } = yield* gcs.uploadFile({
        fileBuffer: Buffer.from(buffer),
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
