import type { CareLog } from '@lily/shared/care-log'

export const mockCareLogs: CareLog[] = [
  {
    id: 'log-1',
    type: 'watering',
    notes: 'Watered thoroughly',
    date: new Date('2024-01-10'),
    photoUrl: undefined,
    plantId: 'plant-1',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  },
  {
    id: 'log-2',
    type: 'fertilization',
    notes: 'Used organic fertilizer',
    date: new Date('2024-01-08'),
    photoUrl: 'https://example.com/fertilizer.jpg',
    plantId: 'plant-1',
    createdAt: new Date('2024-01-08'),
    updatedAt: new Date('2024-01-08'),
  },
  {
    id: 'log-3',
    type: 'watering',
    notes: undefined,
    date: new Date('2024-01-05'),
    photoUrl: undefined,
    plantId: 'plant-1',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05'),
  },
  {
    id: 'log-4',
    type: 'watering',
    notes: 'Light watering',
    date: new Date('2024-01-09'),
    photoUrl: undefined,
    plantId: 'plant-2',
    createdAt: new Date('2024-01-09'),
    updatedAt: new Date('2024-01-09'),
  },
]

export const createTestCareLog = (
  overrides: Partial<CareLog> = {}
): CareLog => ({
  id: `log-${crypto.randomUUID()}`,
  type: 'watering',
  notes: undefined,
  date: new Date(),
  photoUrl: undefined,
  plantId: 'plant-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
