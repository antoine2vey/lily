import { Care, careWhenOf, PlanStepChoice } from '@lily/api/contexts/care'
import { EntityMutationDefect } from '@lily/api/errors/defects'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLogCreateRequest } from '@lily/shared/care-log'
import { Effect, Option } from 'effect'

export const createCareLog = (
  permit: PlantPermit<'care'>,
  request: CareLogCreateRequest
) =>
  Effect.gen(function* () {
    const care = yield* Care
    const careLogs = yield* CareLogRepository
    const recorded = yield* care.recordOne({
      permit,
      careType: request.type,
      on: careWhenOf(request.date),
      notes: Option.fromNullishOr(request.notes),
      photoUrl: Option.fromNullishOr(request.photoUrl),
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
  }).pipe(
    Effect.withSpan('CareLogsService.createCareLog', {
      attributes: { 'plant.id': permit.plantId, 'careLog.type': request.type },
    })
  )
