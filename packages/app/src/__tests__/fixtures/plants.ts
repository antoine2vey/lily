import type { Plant, PlantCareSchedule, PlantPhoto } from '@lily/shared/plant'

export type PlantRecord = Plant

export const makeSchedules = (opts: {
  wateringFrequencyDays: number
  lastWateredAt: Date | null
  nextWateringAt: Date | null
  fertilizationFrequencyDays: number | null
  lastFertilizedAt: Date | null
  nextFertilizationAt: Date | null
}): PlantCareSchedule[] => {
  const schedules: PlantCareSchedule[] = [
    {
      careType: 'watering',
      frequencyDays: opts.wateringFrequencyDays,
      lastCareAt: opts.lastWateredAt,
      nextCareAt: opts.nextWateringAt,
    },
  ]
  if (opts.fertilizationFrequencyDays !== null) {
    schedules.push({
      careType: 'fertilization',
      frequencyDays: opts.fertilizationFrequencyDays,
      lastCareAt: opts.lastFertilizedAt,
      nextCareAt: opts.nextFertilizationAt,
    })
  }
  return schedules
}

export const mockPlants: PlantRecord[] = [
  {
    id: 'plant-1',
    name: 'Monstera Deliciosa',
    description: 'A beautiful tropical plant',
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
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: new Date('2024-01-17'),
      fertilizationFrequencyDays: 30,
      lastFertilizedAt: new Date('2024-01-01'),
      nextFertilizationAt: new Date('2024-01-31'),
    }),
  },
  {
    id: 'plant-2',
    name: 'Snake Plant',
    description: 'Low maintenance indoor plant',
    imageUrl: 'https://example.com/snake-plant.jpg',
    category: 'succulent',
    dateAdded: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    humidityRating: 2,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 1,
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    userId: 'user-1',
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 14,
      lastWateredAt: null,
      nextWateringAt: null,
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    }),
  },
  {
    id: 'plant-3',
    name: 'Fiddle Leaf Fig',
    description: null,
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    humidityRating: 4,
    lightingRating: 4,
    petToxicityRating: 2,
    wateringRating: 4,
    health: 'NEEDS_ATTENTION',
    remindersEnabled: false,
    isFavorite: false,
    userId: 'user-2',
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 10,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: new Date('2024-01-11'),
      fertilizationFrequencyDays: 14,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    }),
  },
]

export const mockPlantPhotos: PlantPhoto[] = [
  {
    id: 'photo-1',
    url: 'https://example.com/photo1.jpg',
    takenAt: new Date('2024-01-05'),
    plantId: 'plant-1',
  },
  {
    id: 'photo-2',
    url: 'https://example.com/photo2.jpg',
    takenAt: new Date('2024-01-06'),
    plantId: 'plant-1',
  },
]

export const createTestPlant = (
  overrides: Partial<PlantRecord> = {}
): PlantRecord => ({
  id: `plant-${Math.random().toString(36).substring(7)}`,
  name: 'Test Plant',
  description: null,
  imageUrl: null,
  category: null,
  dateAdded: new Date(),
  updatedAt: new Date(),
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 0,
  wateringRating: 3,
  health: 'HEALTHY',
  remindersEnabled: true,
  isFavorite: false,
  userId: 'user-1',
  potWidthCm: null,
  potHeightCm: null,
  roomId: null,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: makeSchedules({
    wateringFrequencyDays: 7,
    lastWateredAt: null,
    nextWateringAt: null,
    fertilizationFrequencyDays: null,
    lastFertilizedAt: null,
    nextFertilizationAt: null,
  }),
  ...overrides,
})
