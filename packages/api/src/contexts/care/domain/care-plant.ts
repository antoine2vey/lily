import type { Plan } from '@lily/api/contexts/care/domain/plan'
import type { CareDay, CareType, PlantOwner } from '@lily/shared'
import { Data, DateTime, Option, Schema } from 'effect'

/** Care days between two cares. */
export const Frequency = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1)
).pipe(Schema.brand('Frequency'))
export type Frequency = typeof Frequency.Type

/** The frequency for a number of days as stored or sent, at least one day. */
export const frequencyOfDays = (days: number): Frequency =>
  Frequency.make(Math.max(1, Math.trunc(days)))

export type LifeState = Data.TaggedEnum<{
  Living: Record<never, never>
  Dead: Record<never, never>
}>
export const LifeState = Data.taggedEnum<LifeState>()

export interface Schedule {
  readonly frequency: Frequency
  readonly dueDay: CareDay
  readonly startedOn: CareDay
}

export interface CareEntry {
  readonly id: string
  readonly day: CareDay
}

export interface CareLine {
  readonly careType: CareType
  readonly schedule: Option.Option<Schedule>
  readonly history: ReadonlyArray<CareEntry>
}

export interface CarePlant {
  readonly id: string
  readonly owner: PlantOwner
  readonly life: LifeState
  readonly timezone: string
  readonly today: CareDay
  readonly needsAttention: boolean
  readonly lines: ReadonlyMap<CareType, CareLine>
  readonly plans: ReadonlyArray<Plan>
}

export interface PlantDraft {
  readonly name: string
  readonly description: Option.Option<string>
  readonly category: Option.Option<string>
  readonly imageUrl: Option.Option<string>
  readonly humidityRating: number
  readonly lightingRating: number
  readonly petToxicityRating: number
  readonly wateringRating: number
  readonly potWidthCm: Option.Option<number>
  readonly potHeightCm: Option.Option<number>
  readonly roomId: Option.Option<string>
}

export type CareWhen = Data.TaggedEnum<{
  Today: Record<never, never>
  Day: { readonly day: CareDay }
  /** An instant sent by the client; its time of day is kept for display. */
  At: { readonly instant: DateTime.Utc }
}>
export const CareWhen = Data.taggedEnum<CareWhen>()

/** The optional `date` of a care request: absent means today. */
export const careWhenOf = (date: Date | null | undefined): CareWhen =>
  Option.match(Option.fromNullishOr(date), {
    onNone: () => CareWhen.Today(),
    onSome: (instant) => CareWhen.At({ instant: DateTime.makeUnsafe(instant) }),
  })

export type PlanStepChoice = Data.TaggedEnum<{
  /** The earliest open step of this care type on an accepted plan, if any. */
  Auto: Record<never, never>
  Step: { readonly id: string }
  None: Record<never, never>
}>
export const PlanStepChoice = Data.taggedEnum<PlanStepChoice>()

export interface DecideEnv {
  readonly now: DateTime.Utc
  readonly newCareLogId: string
  readonly wateringDays: Option.Option<number>
  readonly by: Option.Option<string>
}

export const lineOf = (plant: CarePlant, careType: CareType): CareLine =>
  plant.lines.get(careType) ?? {
    careType,
    schedule: Option.none(),
    history: [],
  }
