import { Layer } from 'effect'
import { CareLive as CareServiceLive } from './care'
import { CareStoreLive } from './store'
import { WeatherAdvisorLive } from './weather'

export {
  Care,
  type DueDayMove,
  type RecordCare,
  type RecordOneError,
} from './care'
export {
  CareReads,
  CareReadsLive,
  type DueCare,
  type DuePlant,
  type DueQuery,
  DueScope,
  DueWindow,
  makeCareReads,
  pruneCutoff,
  type ScheduledCare,
} from './care-reads'
export {
  CareWhen,
  careWhenOf,
  Frequency,
  frequencyOfDays,
  PlanStepChoice,
} from './domain/care-plant'
export {
  DueMove,
  type Recorded,
  RecordOutcome,
  Refusal,
} from './domain/decide'
export { CareEvent, CareTopic } from './domain/events'
export {
  hasOverdueCare,
  type PlantCare,
  type SeenSchedule,
  type StoredSchedule,
  seeLivingPlantCare,
  seePlantCare,
} from './plant-care'

export const CareLive = CareServiceLive.pipe(
  Layer.provide(WeatherAdvisorLive),
  Layer.provide(CareStoreLive)
)
