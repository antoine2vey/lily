import {
  type CarePlant,
  type Frequency,
  LifeState,
  type PlantDraft,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  CareWrite,
  type Decision,
  putSchedule,
  Refusal,
  type RefusalOf,
  startSchedules,
} from '@lily/api/contexts/care/domain/decide'
import type {
  CareEvent,
  LifeChange,
} from '@lily/api/contexts/care/domain/events'
import type { OwnerHeld } from '@lily/api/kernel/owner'
import { decision } from '@lily/api/kernel/transact'
import { sameOwner } from '@lily/api/repositories/helpers/plant-owner'
import {
  type CareDay,
  CareDays,
  type CareType,
  type LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import type { PlantDeathCause } from '@lily/shared/plant'
import { Array, Data, type DateTime, Option, Result } from 'effect'

export type LifeCommand = 'Bury' | 'Revive' | 'Remove'

type LifeRule<R> =
  | { readonly _tag: 'Go' }
  | {
      readonly _tag: 'Refuse'
      readonly because: (of: { readonly plantId: string }) => R
    }

const go = { _tag: 'Go' } as const
const refuse = <R>(because: (of: { readonly plantId: string }) => R) =>
  ({ _tag: 'Refuse', because }) as const

export const LIFE = {
  Bury: { Living: go, Dead: refuse(Refusal.AlreadyDead) },
  Revive: { Living: refuse(Refusal.NotDead), Dead: go },
  Remove: { Living: go, Dead: go },
} as const satisfies Record<
  LifeCommand,
  Record<LifeState['_tag'], LifeRule<Refusal>>
>

export type BuryRefusal = RefusalOf<'PlantGone' | 'AlreadyDead'>
export type ReviveRefusal = RefusalOf<'PlantGone' | 'NotDead' | 'OwnerFull'>
export type RemoveRefusal = RefusalOf<'PlantGone'>

export type OwnerRoom = Data.TaggedEnum<{
  Room: Record<never, never>
  Full: { readonly error: LimitExceededError }
}>
export const OwnerRoom = Data.taggedEnum<OwnerRoom>()

const ruled = <R>(
  rule: LifeRule<R>,
  plantId: string
): Result.Result<void, R> =>
  rule._tag === 'Go' ? Result.void : Result.fail(rule.because({ plantId }))

const heldUnder = (
  plant: Option.Option<CarePlant>,
  plantId: string,
  owner: PlantOwner
): Result.Result<CarePlant, RefusalOf<'PlantGone'>> =>
  Result.fromOption(
    Option.filter(plant, (found) => sameOwner(found.owner, owner)),
    () => Refusal.PlantGone({ plantId })
  )

const lifeChanged = (
  plantId: string,
  owner: PlantOwner,
  life: LifeChange,
  by: Option.Option<string>
): CareEvent => ({
  _tag: 'PlantLifeChanged',
  plantId,
  owner,
  life,
  by: Option.getOrNull(by),
})

export interface NewPlant {
  readonly plantId: string
  readonly owner: PlantOwner
  readonly by: string
  readonly draft: PlantDraft
  readonly frequencies: ReadonlyArray<
    readonly [CareType, Option.Option<Frequency>]
  >
  readonly timezone: string
  readonly today: CareDay
}

export const plantNew = (plant: NewPlant): Decision<{ plantId: string }> => {
  const { plantId, owner, by } = plant
  const planted: CarePlant = {
    id: plantId,
    owner,
    life: LifeState.Living(),
    timezone: plant.timezone,
    today: plant.today,
    needsAttention: false,
    lines: new Map(),
    plans: [],
  }
  const scheduled = startSchedules(planted, plant.frequencies)
  return decision(
    { plantId },
    [
      CareWrite.InsertPlant({
        plantId,
        owner,
        createdBy: by,
        draft: plant.draft,
      }),
      ...scheduled.writes,
    ],
    [
      lifeChanged(plantId, owner, 'Planted', Option.some(by)),
      ...scheduled.events,
    ]
  )
}

export interface Burial {
  readonly seenOwner: PlantOwner
  readonly by: Option.Option<string>
  readonly at: DateTime.Utc
  readonly cause: PlantDeathCause
  readonly note: Option.Option<string>
}

export const bury = (
  plant: Option.Option<CarePlant>,
  plantId: string,
  burial: Burial
): Result.Result<Decision<void>, BuryRefusal> =>
  Result.gen(function* () {
    const found = yield* heldUnder(plant, plantId, burial.seenOwner)
    yield* ruled(LIFE.Bury[found.life._tag], plantId)
    return decision(
      undefined,
      [
        CareWrite.BuryPlant({
          plantId,
          at: burial.at,
          cause: burial.cause,
          note: burial.note,
        }),
      ],
      [lifeChanged(plantId, found.owner, 'Buried', burial.by)]
    )
  })

export const restartedDueDay = (
  today: CareDay,
  frequency: Frequency
): CareDay => CareDays.addDays(today, frequency)

export interface Revival {
  readonly held: OwnerHeld
  readonly by: Option.Option<string>
  readonly room: OwnerRoom
}

export const revive = (
  plant: Option.Option<CarePlant>,
  plantId: string,
  revival: Revival
): Result.Result<Decision<void>, ReviveRefusal> =>
  Result.gen(function* () {
    const found = yield* heldUnder(plant, plantId, revival.held.owner)
    yield* ruled(LIFE.Revive[found.life._tag], plantId)
    yield* OwnerRoom.$match(revival.room, {
      Room: () => Result.void,
      Full: ({ error }) => Result.fail(Refusal.OwnerFull({ error })),
    })
    const restarted = Array.flatMap([...found.lines.values()], (line) =>
      Option.toArray(
        Option.map(line.schedule, (schedule) =>
          putSchedule(
            found,
            line.careType,
            {
              ...schedule,
              dueDay: restartedDueDay(found.today, schedule.frequency),
            },
            'revived'
          )
        )
      )
    )
    return decision(
      undefined,
      [
        CareWrite.RevivePlant({ plantId }),
        ...Array.flatMap(restarted, (one) => one.writes),
      ],
      [
        lifeChanged(plantId, found.owner, 'Revived', revival.by),
        ...Array.flatMap(restarted, (one) => one.events),
      ]
    )
  })

export interface Removal {
  readonly seenOwner: PlantOwner
  readonly by: Option.Option<string>
}

export const remove = (
  plant: Option.Option<CarePlant>,
  plantId: string,
  removal: Removal
): Result.Result<Decision<void>, RemoveRefusal> =>
  Result.gen(function* () {
    const found = yield* heldUnder(plant, plantId, removal.seenOwner)
    yield* ruled<never>(LIFE.Remove[found.life._tag], plantId)
    return decision(
      undefined,
      [CareWrite.DeletePlant({ plantId })],
      [lifeChanged(plantId, found.owner, 'Removed', removal.by)]
    )
  })
