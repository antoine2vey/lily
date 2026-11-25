import type { TestPlant } from '@lily/api/__tests__/fixtures/plants'
import {
  fertilizationSpec,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { Rating } from '@lily/shared'
import { mintStoredRef } from '@lily/shared/services/file/stored-ref-mint'

const now = new Date()

const yesterday = new Date(now)
yesterday.setDate(yesterday.getDate() - 1)

const today = new Date(now)
today.setHours(12, 0, 0, 0)

const tomorrow = new Date(now)
tomorrow.setDate(tomorrow.getDate() + 1)

const inThreeDays = new Date(now)
inThreeDays.setDate(inThreeDays.getDate() + 3)

const nextWeek = new Date(now)
nextWeek.setDate(nextWeek.getDate() + 10)

export const mockPlantsForCareTasks: TestPlant[] = [
  {
    id: 'plant-1',
    name: 'Monstera',
    description: 'A tropical plant',
    imageUrl: mintStoredRef('https://example.com/monstera.jpg'),
    category: 'tropical',
    dateAdded: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    humidityRating: Rating.make(4),
    lightingRating: Rating.make(3),
    petToxicityRating: Rating.make(2),
    wateringRating: Rating.make(3),
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-1',
    canopyId: null,
    createdByUserId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-10'),
        nextCareAt: yesterday, // Overdue
      }),
      fertilizationSpec({
        frequencyDays: 30,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: tomorrow, // This week
      }),
    ],
  },
  {
    id: 'plant-2',
    name: 'Snake Plant',
    description: 'Low maintenance',
    imageUrl: null,
    category: 'succulent',
    dateAdded: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    humidityRating: Rating.make(2),
    lightingRating: Rating.make(2),
    petToxicityRating: Rating.make(3),
    wateringRating: Rating.make(1),
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-1',
    canopyId: null,
    createdByUserId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 14,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: today, // Today
      }),
    ],
  },
  {
    id: 'plant-3',
    name: 'Fiddle Leaf Fig',
    description: null,
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    humidityRating: Rating.make(4),
    lightingRating: Rating.make(4),
    petToxicityRating: Rating.make(2),
    wateringRating: Rating.make(4),
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-1',
    canopyId: null,
    createdByUserId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 10,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: inThreeDays, // This week
      }),
      fertilizationSpec({
        frequencyDays: 14,
        nextCareAt: inThreeDays, // This week
      }),
    ],
  },
  {
    id: 'plant-4',
    name: 'Cactus',
    description: 'Desert plant',
    imageUrl: null,
    category: 'succulent',
    dateAdded: new Date('2024-01-04'),
    updatedAt: new Date('2024-01-04'),
    humidityRating: Rating.make(1),
    lightingRating: Rating.make(5),
    petToxicityRating: Rating.make(1),
    wateringRating: Rating.make(1),
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-1',
    canopyId: null,
    createdByUserId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 30,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: nextWeek, // Not this week
      }),
    ],
  },
  {
    id: 'plant-5',
    name: 'Other User Plant',
    description: 'Belongs to another user',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05'),
    humidityRating: Rating.make(3),
    lightingRating: Rating.make(3),
    petToxicityRating: Rating.make(0),
    wateringRating: Rating.make(3),
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-2',
    canopyId: null,
    createdByUserId: 'user-2',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: yesterday, // Overdue but belongs to user-2
      }),
    ],
  },
]

export const mockPlantsNoCare: TestPlant[] = [
  {
    id: 'plant-no-care-1',
    name: 'No Care Plant',
    description: 'No pending care',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    humidityRating: Rating.make(3),
    lightingRating: Rating.make(3),
    petToxicityRating: Rating.make(0),
    wateringRating: Rating.make(3),
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potWidthCm: null,
    potHeightCm: null,
    roomId: null,
    diedAt: null,
    deathCause: null,
    deathNote: null,
    userId: 'user-1',
    canopyId: null,
    createdByUserId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: nextWeek, // Far in the future
      }),
    ],
  },
]
