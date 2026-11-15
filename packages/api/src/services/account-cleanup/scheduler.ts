import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { purgeAccount } from '@lily/api/services/user/helpers/purge-account'
import { Array, DateTime, Duration, Effect } from 'effect'

const PRIVACY_POLICY_DELETION_WINDOW = Duration.days(30)
const MARGIN_FOR_NEXT_RUN_AND_RETRIES = Duration.days(1)
const GRACE_PERIOD = Duration.subtract(
  PRIVACY_POLICY_DELETION_WINDOW,
  MARGIN_FOR_NEXT_RUN_AND_RETRIES
)

export const cleanupExpiredAccounts = Effect.gen(function* () {
  const userRepo = yield* UserRepository

  const now = yield* DateTime.now
  const cutoff = DateTime.toDateUtc(
    DateTime.subtractDuration(now, GRACE_PERIOD)
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
