import type { ReminderKey } from '@lily/api/repositories/notification.repository'
import { Array, Context, Data, Effect, pipe } from 'effect'

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

const HeldReminderKeys = Context.Reference<ReadonlySet<string>>(
  'lily/HeldReminderKeys',
  { defaultValue: () => new Set() }
)

export class ReminderKeyNotHeld extends Data.TaggedError('ReminderKeyNotHeld')<{
  readonly keys: ReadonlyArray<string>
}> {}

export const holdingReminderKeys =
  (keys: ReadonlyArray<ReminderKey>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.provideService(
      effect,
      HeldReminderKeys,
      new Set(Array.map(keys, keyId))
    )

export const requireReminderKeys =
  (keys: ReadonlyArray<ReminderKey>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(HeldReminderKeys, (held) => {
      const late = pipe(
        Array.map(keys, keyId),
        Array.filter((id) => !held.has(id))
      )
      return Array.isReadonlyArrayEmpty(late)
        ? effect
        : Effect.die(new ReminderKeyNotHeld({ keys: late }))
    })
