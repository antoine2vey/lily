import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { RoomRepository } from '@lily/api/repositories/room.repository'
import { assertRoomFits } from '@lily/api/services/plants/helpers/assert-room-fits'
import type { CareType, RoomNotFoundError } from '@lily/shared'
import type { PlantUpdateRequest } from '@lily/shared/plant'
import { GCSService } from '@lily/shared/services/file/gcs'
import type {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import type { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Array, DateTime, Effect, Option, pipe, Record } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Upsert or delete a single optional care schedule.
 * - `undefined` → no change (skip)
 * - `null` → disable (delete schedule row)
 * - `number` → enable/update (upsert with frequency, seed nextCareAt if missing)
 */
const syncOptionalSchedule = (
  scheduleRepo: CareScheduleRepository['Service'],
  existingSchedules: readonly { careType: string; nextCareAt: Date | null }[],
  plantId: string,
  careType: CareType,
  frequencyDays: number | null | undefined,
  now: Date
) =>
  Effect.gen(function* () {
    if (frequencyDays === undefined) return
    if (frequencyDays !== null) {
      const existing = pipe(
        Array.findFirst(existingSchedules, (s) => s.careType === careType),
        Option.getOrNull
      )
      yield* scheduleRepo.upsert(plantId, careType, {
        frequencyDays,
        ...(!existing?.nextCareAt ? { nextCareAt: now } : {}),
      })
    } else {
      yield* scheduleRepo.deleteByPlantAndType(plantId, careType)
    }
  })

export const updatePlant = (
  plant: PlantWithRoom,
  request: PlantUpdateRequest & { id: string },
  image?: PersistedFile
): Effect.Effect<
  PlantWithRoom,
  | SqlError
  | GCSUploadError
  | InvalidImageError
  | RoomNotFoundError
  | GCSConfigError
  | PlatformError,
  | PlantRepository
  | CareScheduleRepository
  | RoomRepository
  | GCSService
  | FileSystem
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    yield* Effect.annotateCurrentSpan('plant.id', request.id)
    yield* assertRoomFits(request.roomId, plant.owner)

    const now = DateTime.toDateUtc(DateTime.nowUnsafe())

    // If an image file was uploaded, upload to GCS and use the URL
    const imageUrl = image
      ? yield* Effect.gen(function* () {
          const gcs = yield* GCSService
          const fileSystem = yield* FileSystem
          const buffer = yield* fileSystem.readFile(image.path)
          const { url } = yield* gcs.uploadFile({
            fileBuffer: Buffer.from(buffer),
            folder: `plants/${request.id}`,
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

    // Update non-care plant fields
    yield* repo.update(request.id, plant.owner, data)

    // Fetch all existing schedules in a single query
    const existingSchedules = yield* scheduleRepo.findByPlant(request.id)

    // Watering is always-present (non-nullable), handle separately
    if (request.wateringFrequencyDays !== undefined) {
      const existing = pipe(
        Array.findFirst(existingSchedules, (s) => s.careType === 'watering'),
        Option.getOrNull
      )
      yield* scheduleRepo.upsert(request.id, 'watering', {
        frequencyDays: request.wateringFrequencyDays,
        ...(!existing?.nextCareAt ? { nextCareAt: now } : {}),
      })
    }

    // Optional care types: null → delete, number → upsert
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'fertilization',
      request.fertilizationFrequencyDays,
      now
    )
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'misting',
      request.mistingFrequencyDays,
      now
    )
    yield* syncOptionalSchedule(
      scheduleRepo,
      existingSchedules,
      request.id,
      'repotting',
      request.repottingFrequencyDays,
      now
    )

    const updated = yield* repo.findById(request.id)
    return pipe(
      Option.fromNullishOr(updated),
      Option.getOrElse(() => plant)
    )
  }).pipe(Effect.withSpan('PlantsService.updatePlant'))
