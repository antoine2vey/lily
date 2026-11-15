import { Care } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { RoomRepository } from '@lily/api/repositories/room.repository'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { frequencyChanges } from '@lily/api/services/plants/helpers/schedule-frequencies'
import type { RoomNotFoundError } from '@lily/shared'
import {
  type PlantIsDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { plantFolder } from '@lily/shared/services/file/stored-object'
import { Effect, Option, pipe, Record } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const updatePlant = (
  plant: PlantWithRoom,
  permit: PlantPermit<'edit'>,
  request: PlantUpdateRequest & { id: string },
  image?: PersistedFile
): Effect.Effect<
  PlantWithRoom,
  | SqlError
  | GCSUploadError
  | InvalidImageError
  | RoomNotFoundError
  | PlantNotFoundError
  | PlantIsDeadError
  | GCSConfigError
  | PlatformError,
  | PlantRepository
  | Care
  | RoomRepository
  | GCSService
  | FileSystem
  | SqlClient.SqlClient
  | Outbox
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const care = yield* Care
    yield* Effect.annotateCurrentSpan('plant.id', request.id)
    yield* assertRoomFits(request.roomId, plant.owner)

    // If an image file was uploaded, upload to GCS and use the URL
    const imageUrl = image
      ? yield* Effect.gen(function* () {
          const gcs = yield* GCSService
          const fileSystem = yield* FileSystem
          const buffer = yield* fileSystem.readFile(image.path)
          const { url } = yield* gcs.uploadFile({
            fileBuffer: Buffer.from(buffer),
            folder: plantFolder(request.id),
          })
          return url
        })
      : Option.getOrUndefined(Option.fromNullishOr(request.imageUrl))

    // Build update data from request, excluding care-related fields
    const data = pipe(
      Record.fromEntries(
        Record.toEntries<string, unknown>({ ...request, imageUrl })
      ),
      Record.remove('id'),
      Record.remove('wateringFrequencyDays'),
      Record.remove('fertilizationFrequencyDays'),
      Record.remove('mistingFrequencyDays'),
      Record.remove('repottingFrequencyDays'),
      Record.filter((value) => value !== undefined)
    ) as Record<string, unknown>

    yield* transact(
      Effect.gen(function* () {
        const written = yield* repo.update(request.id, plant.owner, data)
        if (!written) {
          return yield* new PlantNotFoundError({ plantId: request.id })
        }
        yield* care.setSchedules({
          permit,
          frequencies: frequencyChanges(request),
        })
        if (request.remindersEnabled !== undefined) {
          yield* Reminders.request(Dirty.Plants({ plantIds: [request.id] }))
        }
      })
    )

    const updated = yield* repo.findById(request.id)
    return pipe(
      Option.fromNullishOr(updated),
      Option.getOrElse(() => plant)
    )
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
