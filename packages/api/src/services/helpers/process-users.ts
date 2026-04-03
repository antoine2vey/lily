import type { SqlError } from '@effect/sql/SqlError'
import type { DndWindowBlockedError } from '@lily/shared'
import { Data, Effect, Ref } from 'effect'

export class SkipUserError extends Data.TaggedError('SkipUserError')<{
  readonly reason: string
}> {}

/**
 * Run a per-item effect across a list with standard scheduler boilerplate:
 * counting, concurrency, error handling, and logging.
 *
 * Each `processItem` effect may:
 * - yield `new SkipUserError(...)` to skip (logged at INFO)
 * - fail with `DndWindowBlockedError` (logged at INFO)
 * - fail with `SqlError` (logged at WARNING)
 */
export const processUsers = <U extends { readonly id: string }, R>(config: {
  readonly schedulerName: string
  readonly notificationType: string
  readonly users: ReadonlyArray<U>
  readonly processUser: (
    user: U
  ) => Effect.Effect<void, SkipUserError | DndWindowBlockedError | SqlError, R>
}) =>
  Effect.gen(function* () {
    const created = yield* Ref.make(0)
    const label = `[${config.schedulerName}]`
    const tag = config.notificationType

    yield* Effect.forEach(
      config.users,
      (user) =>
        Effect.gen(function* () {
          yield* config.processUser(user)
          yield* Ref.update(created, (n) => n + 1)
        }).pipe(
          Effect.catchTags({
            SkipUserError: (e) =>
              Effect.log(`${label} Skipped user (${tag})`, {
                reason: e.reason,
                userId: user.id,
              }),
            DndWindowBlockedError: () =>
              Effect.log(`${label} Skipped — DND window (${tag})`, {
                userId: user.id,
              }),
            SqlError: (e) =>
              Effect.logWarning(`${label} Item failed (${tag})`, {
                userId: user.id,
                error: String(e),
              }),
          })
        ),
      { concurrency: 10 }
    )

    const total = yield* Ref.get(created)
    if (total > 0) {
      yield* Effect.log(`${label} Created ${tag} notifications`, {
        count: total,
      })
    }
  })
