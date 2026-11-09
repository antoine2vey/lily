import type { ReminderKey } from '@lily/api/repositories/notification.repository'
import { Array, Context, Data, Effect, Option, pipe } from 'effect'

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

const HeldReminderKeys = Context.Reference<Option.Option<ReadonlySet<string>>>(
  'lily/HeldReminderKeys',
  { defaultValue: Option.none }
)

class ReminderKeyNotHeld extends Data.TaggedError('ReminderKeyNotHeld')<{
  readonly keys: ReadonlyArray<string>
}> {}

class LockPlanNested extends Data.TaggedError('LockPlanNested') {}

export const holdingReminderKeys =
  (keys: ReadonlyArray<ReminderKey>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(HeldReminderKeys, (held) =>
      Option.isSome(held)
        ? Effect.die(new LockPlanNested())
        : Effect.provideService(
            effect,
            HeldReminderKeys,
            Option.some(new Set(Array.map(keys, keyId)))
          )
    )

export const requireReminderKeys =
  (keys: ReadonlyArray<ReminderKey>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(HeldReminderKeys, (held) => {
      const late = pipe(
        Array.map(keys, keyId),
        Array.filter((id) => !Option.exists(held, (set) => set.has(id)))
      )
      return Array.isReadonlyArrayEmpty(late)
        ? effect
        : Effect.die(new ReminderKeyNotHeld({ keys: late }))
    })
