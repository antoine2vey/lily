import { Care, careWhenOf, PlanStepChoice } from '@lily/api/contexts/care'
import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import {
  Holder,
  releaseUpload,
} from '@lily/api/services/helpers/release-objects'
import { uploadToPlantFolder } from '@lily/api/services/plants/helpers/upload-to-plant-folder'
import type { CareLogCreateRequest } from '@lily/shared/care-log'
import { Effect, Option } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'

export const createCareLog = (
  permit: PlantPermit<'care'>,
  request: CareLogCreateRequest
) => recordCareLog(permit, request, Option.none())

export const createCareLogWithPhoto = (
  permit: PlantPermit<'care'>,
  request: CareLogCreateRequest,
  photo: PersistedFile
) =>
  Effect.flatMap(uploadToPlantFolder(permit.plantId, photo), (url) =>
    recordCareLog(permit, request, Option.some(url)).pipe(
      Effect.tapError(() =>
        releaseUpload(Holder.Plant({ plantId: permit.plantId }), url)
      )
    )
  )

const recordCareLog = (
  permit: PlantPermit<'care'>,
  request: CareLogCreateRequest,
  photoUrl: Option.Option<string>
) =>
  transact(
    Effect.gen(function* () {
      const care = yield* Care
      const careLogs = yield* CareLogRepository
      const recorded = yield* care.recordOne({
        permit,
        careType: request.type,
        on: careWhenOf(request.date),
        notes: Option.fromNullishOr(request.notes),
        photoUrl,
        planStep: PlanStepChoice.Auto(),
      })
      const log = yield* careLogs.findById(recorded.careLogId, permit.plantId)
      return yield* Option.match(Option.fromNullishOr(log), {
        onNone: () =>
          Effect.die(
            new EntityMutationDefect({
              message: 'Recorded care log could not be read back',
              entity: 'care-log',
              operation: 'create',
            })
          ),
        onSome: Effect.succeed,
      })
    })
  ).pipe(
    Effect.withSpan('CareLogsService.createCareLog', {
      attributes: { 'plant.id': permit.plantId, 'careLog.type': request.type },
    })
  )
