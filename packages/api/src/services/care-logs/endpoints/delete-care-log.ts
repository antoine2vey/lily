import { Care } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { RecordPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import type { StoredRefRepository } from '@lily/api/repositories/stored-ref.repository'
import {
  plantHeld,
  releasing,
} from '@lily/api/services/helpers/release-objects'
import type { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import type { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import type { GCSService } from '@lily/shared/services/file/gcs'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const deleteCareLog = (
  permit: RecordPermit<'care'>,
  logId: string
): Effect.Effect<
  { message: string },
  CareLogNotFoundError | PlantNotAuthorizedError | SqlError,
  Care | StoredRefRepository | GCSService | SqlClient.SqlClient | Outbox
> =>
  Effect.flatMap(Care, (care) =>
    transact(
      releasing(
        plantHeld(permit.plantId),
        care.remove({ permit, careLogId: logId })
      )
    )
  ).pipe(
    Effect.as({ message: `Care log ${logId} deleted successfully` }),
    Effect.withSpan('CareLogsService.deleteCareLog', {
      attributes: { 'plant.id': permit.plantId, 'careLog.id': logId },
    })
  )
