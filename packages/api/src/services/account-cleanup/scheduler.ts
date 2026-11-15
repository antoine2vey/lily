import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { Array, DateTime, Effect } from 'effect'

// The privacy policy promises deletion within 30 days. The day of margin
// covers the wait for the next hourly run and the retries of a failed purge.
const GRACE_PERIOD_DAYS = 29

export const cleanupExpiredAccounts = Effect.gen(function* () {
  const userRepo = yield* UserRepository

  const now = yield* DateTime.now
  const cutoff = DateTime.toDateUtc(
    DateTime.subtract(now, { days: GRACE_PERIOD_DAYS })
  )
  const expiredUsers = yield* userRepo.findExpiredDeletions(cutoff)

  if (Array.isArrayEmpty(expiredUsers)) return

  yield* Effect.log('Permanently deleting expired accounts', {
    count: Array.length(expiredUsers),
  })

  yield* Effect.forEach(
    expiredUsers,
    (user) =>
      Effect.gen(function* () {
        yield* purgeAccount(user.id)
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
  interval: '1 hour',
  runOnStartup: true,
  task: cleanupExpiredAccounts,
})
