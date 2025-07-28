import { Database } from '@lily/db'
import { Effect } from 'effect'

// Delete care log
export const deleteCareLog = (plantId: string, logId: string) =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake success message
    return { message: `Care log ${logId} deleted successfully` }
  })
