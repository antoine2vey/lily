import { UserRepository } from '@lily/api/repositories/user.repository'
import { leaveCanopyAndDelete } from '@lily/api/services/canopy/helpers/leave-canopy'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { daysAgoAsDate } from '@lily/shared'
import { Array, Effect } from 'effect'

const GRACE_PERIOD_DAYS = 30

export const cleanupExpiredAccounts = Effect.gen(function* () {
  const userRepo = yield* UserRepository

  const cutoff = daysAgoAsDate(GRACE_PERIOD_DAYS)
  const expiredUsers = yield* userRepo.findExpiredDeletions(cutoff)

  if (Array.isArrayEmpty(expiredUsers)) return

  yield* Effect.log('Permanently deleting expired accounts', {
    count: Array.length(expiredUsers),
  })

  yield* Effect.forEach(
    expiredUsers,
    (user) =>
      Effect.gen(function* () {
        yield* leaveCanopyAndDelete(user.id)(userRepo.delete(user.id))
        yield* Effect.log('Account permanently deleted', {
          userId: user.id,
          deletedAt: user.deletedAt,
        })
      }).pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logError('Account deletion failed, retried next run', {
            userId: user.id,
            error,
          })
        )
      ),
    { concurrency: 5 }
  )
}).pipe(Effect.withSpan('account-cleanup.cleanupExpiredAccounts'))

export const startAccountCleanupScheduler = createScheduler({
  name: 'account-cleanup',
  interval: '1 day',
  runOnStartup: false,
  task: cleanupExpiredAccounts,
})
