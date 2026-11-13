import { type CanopyId, CareDay, CareDays, careStatus } from '@lily/shared'
import type { Plant, PlantCareSchedule } from '@lily/shared/plant'
import { Array, DateTime } from 'effect'

/** Schedules as the API returns them: status decided on a UTC `today`. */
export const seen = (
  schedules: ReadonlyArray<Omit<PlantCareSchedule, 'dueDay' | 'status'>>,
  today: Date = new Date()
): Array<PlantCareSchedule> =>
  Array.map(schedules, (schedule) => {
    if (schedule.nextCareAt === null) {
      return { ...schedule, dueDay: null, status: null }
    }
    const dueDay = CareDays.of(DateTime.makeUnsafe(schedule.nextCareAt), 'UTC')
    return {
      ...schedule,
      dueDay,
      status: careStatus(
        dueDay,
        CareDays.today('UTC', DateTime.makeUnsafe(today))
      ),
    }
  })

/** The plant-level care fields of an API plant. */
export const careToday = {
  careTimezone: 'UTC',
  today: CareDay.make('2024-01-01'),
}

export const makePlant = (overrides: Partial<Plant> = {}): Plant => ({
  id: 'plant-1',
  name: 'Monstera',
  description: null,
  imageUrl: null,
  category: 'tropical',
  dateAdded: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  humidityRating: 4,
  lightingRating: 3,
  petToxicityRating: 2,
  wateringRating: 3,
  health: 'HEALTHY',
  remindersEnabled: true,
  isFavorite: false,
  userId: 'user-1',
  roomId: null,
  diedAt: null,
  deathCause: null,
  deathNote: null,
  potWidthCm: null,
  potHeightCm: null,
  room: null,
  ownership: 'owned',
  ownerName: null,
  schedules: [],
  ...careToday,
  ...overrides,
})

export const canopyPlant = makePlant({
  id: 'plant-canopy',
  name: 'Shared Fern',
  userId: null,
  ownership: 'canopy',
  canopy: { id: 'canopy-1' as CanopyId, name: 'Maple House' },
})

export const delegatedPlant = makePlant({
  id: 'plant-delegated',
  name: 'Borrowed Pothos',
  userId: 'user-2',
  ownership: 'caretaking',
  ownerName: 'Alex',
})
