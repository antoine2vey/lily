import type { CareLog } from '@lily/shared/care-log'

export const mockCareLogs: CareLog[] = [
  {
    id: 'log-1',
    plantId: 'plant-1',
    type: 'watering',
    date: new Date('2024-01-10T10:00:00Z'),
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
    notes: undefined,
    photoUrl: 'https://example.com/photo.jpg',
    createdAt: new Date('2024-01-05T10:00:00Z'),
    updatedAt: new Date('2024-01-05T10:00:00Z'),
  },
]

export const createTestCareLog = (
  overrides: Partial<CareLog> = {}
): CareLog => ({
  id: `log-${Math.random().toString(36).substring(7)}`,
  plantId: 'plant-1',
  type: 'watering',
  date: new Date(),
  notes: undefined,
  photoUrl: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
