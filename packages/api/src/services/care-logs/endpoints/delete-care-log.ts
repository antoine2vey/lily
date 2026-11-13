import { Care } from '@lily/api/contexts/care'
import type { PlantPermit } from '@lily/api/kernel/permit'
import type { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import { Effect } from 'effect'

export const deleteCareLog = (
  permit: PlantPermit<'care'>,
  logId: string
): Effect.Effect<{ message: string }, CareLogNotFoundError, Care> =>
  Effect.flatMap(Care, (care) =>
    care.remove({ permit, careLogId: logId })
  ).pipe(
    Effect.as({ message: `Care log ${logId} deleted successfully` }),
    Effect.withSpan('CareLogsService.deleteCareLog', {
      attributes: { 'plant.id': permit.plantId, 'careLog.id': logId },
    })
  )
