import type { plants } from '@lily/db/schema'
import type { CareType } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'

export type PlantRecord = typeof plants.$inferSelect

export interface ScheduleSpec {
  careType: CareType
  frequencyDays: number
  lastCareAt: Date | null
  nextCareAt: Date | null
}

// Extended type for test fixtures — includes scheduleSpecs that
// schedulesFromPlants uses to derive CareScheduleRow entries.
export interface TestPlant extends PlantRecord {
  scheduleSpecs: ScheduleSpec[]
}

export const wateringSpec = (
  overrides: Partial<Omit<ScheduleSpec, 'careType'>> = {}
): ScheduleSpec => ({
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: null,
  ...overrides,
})

export const fertilizationSpec = (
  overrides: Partial<Omit<ScheduleSpec, 'careType'>> = {}
): ScheduleSpec => ({
  careType: 'fertilization',
  frequencyDays: 30,
  lastCareAt: null,
  nextCareAt: null,
  ...overrides,
})

export const mockPlants: TestPlant[] = [
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
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-10'),
        nextCareAt: new Date('2024-01-17'),
      }),
      fertilizationSpec({
        frequencyDays: 30,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: new Date('2024-01-31'),
      }),
    ],
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
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [wateringSpec({ frequencyDays: 14 })],
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
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-2',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 10,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: new Date('2024-01-11'),
      }),
      fertilizationSpec({ frequencyDays: 14 }),
    ],
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

// Plants with explicit watering dates for overdue filter tests
const overdueDate = new Date('2024-01-10T12:00:00Z') // in the past
const todayDate = new Date() // today
const tomorrowDate = new Date(Date.now() + 86400000) // tomorrow

export const mockOverduePlants: TestPlant[] = [
  {
    id: 'plant-overdue-1',
    name: 'Overdue Fern',
    description: 'Needs water badly',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    humidityRating: 4,
    lightingRating: 3,
    petToxicityRating: 0,
    wateringRating: 4,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-03'),
        nextCareAt: overdueDate,
      }),
    ],
  },
  {
    id: 'plant-today-1',
    name: 'Today Cactus',
    description: 'Due today',
    imageUrl: null,
    category: 'succulent',
    dateAdded: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    humidityRating: 1,
    lightingRating: 5,
    petToxicityRating: 0,
    wateringRating: 1,
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 14,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: todayDate,
      }),
    ],
  },
  {
    id: 'plant-tomorrow-1',
    name: 'Tomorrow Lily',
    description: 'Due tomorrow',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 0,
    wateringRating: 3,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: tomorrowDate,
      }),
    ],
  },
  {
    id: 'plant-null-water',
    name: 'No Schedule Plant',
    description: 'No watering schedule',
    imageUrl: null,
    category: 'succulent',
    dateAdded: new Date('2024-01-04'),
    updatedAt: new Date('2024-01-04'),
    humidityRating: 2,
    lightingRating: 2,
    petToxicityRating: 0,
    wateringRating: 1,
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [wateringSpec({ frequencyDays: 30 })],
  },
  {
    id: 'plant-overdue-user2',
    name: 'Other User Overdue',
    description: 'Belongs to user-2',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05'),
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 0,
    wateringRating: 3,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    userId: 'user-2',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: overdueDate,
      }),
    ],
  },
]

export const createTestPlant = (
  overrides: Partial<TestPlant> = {}
): TestPlant => ({
  id: `plant-${crypto.randomUUID()}`,
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
  potWidthCm: null,
  potHeightCm: null,
  roomId: null,
  userId: 'user-1',
  scheduleSpecs: [wateringSpec()],
  ...overrides,
})
