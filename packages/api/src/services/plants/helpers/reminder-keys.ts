import {
  NotificationRepository,
  type ReminderKey,
} from '@lily/api/repositories/notification.repository'
import { Array, Context, Data, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const CARE_REMINDER_TYPES = [
  'watering_reminder',
  'fertilization_reminder',
  'misting_reminder',
  'repotting_reminder',
] as const

export type CareReminderType = (typeof CARE_REMINDER_TYPES)[number]

export const reminderKeysFor = (
  plantIds: ReadonlyArray<string>,
  types: ReadonlyArray<CareReminderType> = CARE_REMINDER_TYPES
): ReadonlyArray<ReminderKey> =>
  Array.flatMap(plantIds, (plantId) =>
    Array.map(types, (type) => ({ plantId, type }))
  )

const keyId = (key: ReminderKey) => `${key.plantId}:${key.type}`

export const HeldReminderKeys = Context.Reference<ReadonlySet<string> | null>(
  'lily/HeldReminderKeys',
  { defaultValue: () => null }
)

export class ReminderKeyNotHeld extends Data.TaggedError('ReminderKeyNotHeld')<{
  readonly keys: ReadonlyArray<string>
}> {}

export const withReminderKeys =
  (
    keys: ReadonlyArray<ReminderKey>,
    updatingUserId: Option.Option<string> = Option.none()
  ) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError,
    R | SqlClient.SqlClient | NotificationRepository
  > =>
    Effect.gen(function* () {
      const held = yield* HeldReminderKeys
      if (held !== null) {
        const late = pipe(
          Array.map(keys, keyId),
          Array.filter((id) => !held.has(id))
        )
        return Array.isReadonlyArrayEmpty(late)
          ? yield* effect
          : yield* Effect.die(new ReminderKeyNotHeld({ keys: late }))
      }
      const sql = yield* SqlClient.SqlClient
      const notificationRepo = yield* NotificationRepository
      return yield* sql.withTransaction(
        Effect.andThen(
          notificationRepo.lockReminderKeys(keys, updatingUserId),
          Effect.provideService(
            effect,
            HeldReminderKeys,
            new Set(Array.map(keys, keyId))
          )
        )
      )
    })
