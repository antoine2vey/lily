import { Care } from '@lily/api/contexts/care'
import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import {
  PlantRepository,
  type PlantWithRoom,
  type UpdatePlantData,
} from '@lily/api/repositories/plant.repository'
import type { RoomRepository } from '@lily/api/repositories/room.repository'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import type { GCSService } from '@lily/api/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/api/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/api/services/file/image-upload'
import {
  Holder,
  plantHeld,
  releasing,
  releasingRefusedUpload,
} from '@lily/api/services/helpers/release-objects'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import { frequencyChanges } from '@lily/api/services/plants/helpers/schedule-frequencies'
import { uploadToPlantFolder } from '@lily/api/services/plants/helpers/upload-to-plant-folder'
import type { RoomNotFoundError } from '@lily/shared'
import {
  type PlantIsDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { Effect, Option, Struct } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const REQUEST_COLUMNS = [
  'name',
  'description',
  'category',
  'humidityRating',
  'lightingRating',
  'petToxicityRating',
  'wateringRating',
  'isFavorite',
  'remindersEnabled',
  'potWidthCm',
  'potHeightCm',
  'roomId',
] as const satisfies ReadonlyArray<
  keyof PlantUpdateRequest & keyof UpdatePlantData
>

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
  | StoredRefRepository
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

    const upload = Option.fromUndefinedOr(
      image ? yield* uploadToPlantFolder(request.id, image) : undefined
    )

    const data: UpdatePlantData = {
      ...Struct.pick(request, REQUEST_COLUMNS),
      ...Option.match(upload, {
        onNone: () => ({}),
        onSome: (imageUrl) => ({ imageUrl }),
      }),
    }

    const write = Effect.gen(function* () {
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
      const updated = yield* repo.findById(request.id)
      if (!updated) {
        return yield* new PlantNotFoundError({ plantId: request.id })
      }
      return updated
    })

    return yield* Option.match(upload, {
      onNone: () => transact(write),
      onSome: (url) =>
        transact(releasing(plantHeld(request.id), write)).pipe(
          releasingRefusedUpload(Holder.Plant({ plantId: request.id }), url)
        ),
    })
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
