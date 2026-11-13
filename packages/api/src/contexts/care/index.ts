import { Layer } from 'effect'
import { CareLive as CareServiceLive } from './care'
import { CarePlansLive } from './care-plans'
import { PlantLifeLive } from './plant-life'
import { CareStoreLive } from './store'
import { WeatherAdvisorLive } from './weather'

export {
  Care,
  type DueDayMove,
  type RecordCare,
  type RecordOneError,
} from './care'
export { CarePlans } from './care-plans'
export {
  CareReads,
  CareReadsLive,
  type DueCare,
  type DuePlant,
  type DuePrune,
  type DueQuery,
  DueScope,
  DueWindow,
  duePrune,
  makeCareReads,
  type ScheduledCare,
} from './care-reads'
export {
  CareWhen,
  careWhenOf,
  Frequency,
  frequencyOfDays,
  PlanStepChoice,
  type PlantDraft,
} from './domain/care-plant'
export {
  DueMove,
  type Recorded,
  RecordOutcome,
  Refusal,
} from './domain/decide'
export { CareEvent, CareTopic, type LifeChange } from './domain/events'
export { OwnerRoom } from './domain/life'
export type { ProposedStep } from './domain/plan'
export {
  hasOverdueCare,
  type PlantCare,
  type SeenSchedule,
  type StoredSchedule,
  seeLivingPlantCare,
  seePlantCare,
} from './plant-care'
export { PlantLife } from './plant-life'
export { dueOnOrBefore, storedDay } from './stored-day'

export const CareLive = Layer.mergeAll(
  CareServiceLive,
  CarePlansLive,
  PlantLifeLive
).pipe(Layer.provide(WeatherAdvisorLive), Layer.provide(CareStoreLive))
