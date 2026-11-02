import type { CanopyId } from '@lily/shared'
import type { Plant } from '@lily/shared/plant'

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
