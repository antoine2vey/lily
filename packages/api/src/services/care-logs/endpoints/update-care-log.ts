import { Care, CareWhen } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog, CareLogUpdateRequest } from '@lily/shared/care-log'
import { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import type {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
} from '@lily/shared/errors/plant'
import { DateTime, Effect, Option } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const updateCareLog = (
  permit: PlantPermit<'care'>,
  logId: string,
  request: CareLogUpdateRequest
): Effect.Effect<
  CareLog,
  | SqlError
  | CareLogNotFoundError
  | AlreadyCaredTodayError
  | FutureDateNotAllowedError,
  Care | CareLogRepository | SqlClient.SqlClient | Outbox
> =>
  transact(
    Effect.gen(function* () {
      const care = yield* Care
      const careLogs = yield* CareLogRepository
      yield* care.amend({
        permit,
        careLogId: logId,
        on: Option.map(Option.fromUndefinedOr(request.date), (date) =>
          CareWhen.At({ instant: DateTime.makeUnsafe(date) })
        ),
        notes: Option.map(Option.fromUndefinedOr(request.notes), Option.some),
        photoUrl: Option.map(
          Option.fromUndefinedOr(request.photoUrl),
          Option.some
        ),
      })
      const log = yield* careLogs.findById(logId, permit.plantId)
      return yield* Effect.fromNullishOr(log).pipe(
        Effect.mapError(() => new CareLogNotFoundError({ careLogId: logId }))
      )
    })
  ).pipe(
    Effect.withSpan('CareLogsService.updateCareLog', {
      attributes: { 'plant.id': permit.plantId, 'careLog.id': logId },
    })
  )
