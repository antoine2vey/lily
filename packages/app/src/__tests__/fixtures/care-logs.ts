import { CareDay, CareDays } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { DateTime } from 'effect'

export const mockCareLogs: CareLog[] = [
  {
    id: 'log-1',
    plantId: 'plant-1',
    type: 'watering',
    date: new Date('2024-01-10T10:00:00Z'),
    careDay: CareDay.make('2024-01-10'),
    notes: 'Regular watering',
    photoUrl: undefined,
    createdAt: new Date('2024-01-10T10:00:00Z'),
    updatedAt: new Date('2024-01-10T10:00:00Z'),
  },
  {
    id: 'log-2',
    plantId: 'plant-1',
    type: 'fertilization',
    date: new Date('2024-01-08T10:00:00Z'),
    careDay: CareDay.make('2024-01-08'),
    notes: 'Monthly fertilization',
    photoUrl: undefined,
    createdAt: new Date('2024-01-08T10:00:00Z'),
    updatedAt: new Date('2024-01-08T10:00:00Z'),
  },
  {
    id: 'log-3',
    plantId: 'plant-2',
    type: 'watering',
    date: new Date('2024-01-05T10:00:00Z'),
    careDay: CareDay.make('2024-01-05'),
    notes: undefined,
    photoUrl: 'https://example.com/photo.jpg',
    createdAt: new Date('2024-01-05T10:00:00Z'),
    updatedAt: new Date('2024-01-05T10:00:00Z'),
  },
]

export const createTestCareLog = (
  overrides: Partial<CareLog> = {}
): CareLog => {
  const date = overrides.date ?? new Date()
  return {
    id: `log-${Math.random().toString(36).substring(7)}`,
    plantId: 'plant-1',
    type: 'watering',
    date,
    careDay: CareDays.of(DateTime.makeUnsafe(date), 'UTC'),
    notes: undefined,
    photoUrl: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
