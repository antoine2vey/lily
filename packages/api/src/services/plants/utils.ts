import { Match, pipe } from 'effect'

// Simple request types
export type PlantByIdRequest = { id: string }
export type PlantDeleteRequest = { id: string }

export type CareType = 'watering' | 'fertilization'

export interface CareTypeConfig {
  readonly frequencyField:
    | 'wateringFrequencyDays'
    | 'fertilizationFrequencyDays'
  readonly lastCareField: 'lastWateredAt' | 'lastFertilizedAt'
  readonly nextCareField: 'nextWateringAt' | 'nextFertilizationAt'
  readonly reminderType: 'watering_reminder' | 'fertilization_reminder'
  readonly careLogType: 'watering' | 'fertilization'
}

export const getCareTypeConfig = (careType: CareType): CareTypeConfig =>
  pipe(
    Match.value(careType),
    Match.when('watering', () => ({
      frequencyField: 'wateringFrequencyDays' as const,
      lastCareField: 'lastWateredAt' as const,
      nextCareField: 'nextWateringAt' as const,
      reminderType: 'watering_reminder' as const,
      careLogType: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      frequencyField: 'fertilizationFrequencyDays' as const,
      lastCareField: 'lastFertilizedAt' as const,
      nextCareField: 'nextFertilizationAt' as const,
      reminderType: 'fertilization_reminder' as const,
      careLogType: 'fertilization' as const,
    })),
    Match.exhaustive
  )
