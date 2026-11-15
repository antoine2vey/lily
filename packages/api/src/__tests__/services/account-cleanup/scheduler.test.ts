import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { NoStoredPhotosLive } from '@lily/api/__tests__/mocks/account-photo.repository'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { Absence } from '@lily/api/contexts/absence'
import { Canopy } from '@lily/api/contexts/canopy'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { startAccountCleanupScheduler } from '@lily/api/services/account-cleanup/scheduler'
import type { User } from '@lily/shared'
import {
  Array,
  Clock,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  References,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

const PRIVACY_POLICY_DELETION_WINDOW = Duration.days(30)

const deletedAt = DateTime.makeUnsafe('2026-03-01T09:00:00Z')
const at = (since: Duration.Input) => DateTime.addDuration(deletedAt, since)

const databaseDown = new SqlError({
  reason: new UnknownError({
    cause: new Error('database unreachable'),
    message: 'database unreachable',
  }),
})

const accounts = (failedPurges = 0) => {
  let failuresLeft = failedPurges
  let pending: ReadonlyArray<User> = [
    {
      ...mockUser1,
      id: 'leaving',
      status: 'pending_deletion',
      deletedAt: DateTime.toDateUtc(deletedAt),
    },
  ]
  let purgedAt = Option.none<DateTime.Utc>()

  const layer = Layer.mergeAll(
    Layer.mock(UserRepository, {
      findExpiredDeletions: (cutoff) =>
        Effect.succeed(
          Array.filter(
            pending,
            (user) => user.deletedAt !== null && user.deletedAt <= cutoff
          )
        ),
      delete: (id) =>
        failuresLeft > 0
          ? Effect.andThen(
              Effect.sync(() => {
                failuresLeft--
              }),
              Effect.fail(databaseDown)
            )
          : Effect.map(Clock.currentTimeMillis, (millis) => {
              pending = Array.filter(pending, (user) => user.id !== id)
              purgedAt = Option.some(DateTime.makeUnsafe(millis))
              return null
            }),
    }),
    Layer.mock(Canopy, { leaveForDeletion: () => transactInMemory }),
    Layer.mock(Absence, { releaseForDeletion: () => Effect.void }),
    NoStoredPhotosLive
  )

  return { layer, purgedAt: () => purgedAt }
}

const runApi =
  (layer: ReturnType<typeof accounts>['layer']) => (lifetime: Duration.Input) =>
    Effect.scoped(
      Effect.andThen(
        Layer.build(
          Layer.effectDiscard(startAccountCleanupScheduler).pipe(
            Layer.provide(layer)
          )
        ),
        TestClock.adjust(lifetime)
      )
    )

const run = <A>(effect: Effect.Effect<A>) =>
  effect.pipe(
    Effect.provide(TestClock.layer()),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromise
  )

describe('account-cleanup scheduler', () => {
  it('purges an account deleted 29 days ago as soon as the API starts', async () => {
    const world = accounts()
    const startedAt = at(Duration.sum(Duration.days(29), Duration.hours(1)))

    await run(
      Effect.andThen(
        TestClock.setTime(DateTime.toEpochMillis(startedAt)),
        runApi(world.layer)('1 second')
      )
    )

    expect(world.purgedAt()).toEqual(Option.some(startedAt))
  })

  it.each([
    { api: 'never restarts', lifetime: '4 days', failedPurges: 0 },
    { api: 'restarts every 12 hours', lifetime: '12 hours', failedPurges: 0 },
    { api: 'restarts every 23 hours', lifetime: '23 hours', failedPurges: 0 },
    { api: 'fails its first purge', lifetime: '4 days', failedPurges: 1 },
  ] as const)(
    'purges inside the promise when the API $api',
    async ({ lifetime, failedPurges }) => {
      const world = accounts(failedPurges)

      await run(
        Effect.andThen(
          TestClock.setTime(
            DateTime.toEpochMillis(
              at(Duration.sum(Duration.days(27), Duration.minutes(1)))
            )
          ),
          Effect.repeat(runApi(world.layer)(lifetime), {
            while: () => Option.isNone(world.purgedAt()),
            times: 20,
          })
        )
      )

      const hoursUntilPurge = Option.match(world.purgedAt(), {
        onNone: () => Number.POSITIVE_INFINITY,
        onSome: (purged) =>
          Duration.toHours(DateTime.distance(deletedAt, purged)),
      })
      expect(hoursUntilPurge).toBeGreaterThanOrEqual(29 * 24)
      expect(hoursUntilPurge).toBeLessThanOrEqual(
        Duration.toHours(PRIVACY_POLICY_DELETION_WINDOW)
      )
    }
  )
})
