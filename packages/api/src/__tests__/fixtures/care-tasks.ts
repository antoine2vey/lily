import type { TestPlant } from '@lily/api/__tests__/fixtures/plants'
import {
  fertilizationSpec,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'

// Helper to get dates relative to now
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

// Mock plants for care tasks testing
export const mockPlantsForCareTasks: TestPlant[] = [
  {
    id: 'plant-1',
    name: 'Monstera',
    description: 'A tropical plant',
    imageUrl: 'https://example.com/monstera.jpg',
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
    potSize: null,
    roomId: null,
    userId: 'user-1',
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
    humidityRating: 2,
    lightingRating: 2,
    petToxicityRating: 3,
    wateringRating: 1,
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potSize: null,
    roomId: null,
    userId: 'user-1',
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
    humidityRating: 4,
    lightingRating: 4,
    petToxicityRating: 2,
    wateringRating: 4,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potSize: null,
    roomId: null,
    userId: 'user-1',
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
    humidityRating: 1,
    lightingRating: 5,
    petToxicityRating: 1,
    wateringRating: 1,
    health: 'THRIVING',
    remindersEnabled: true,
    isFavorite: false,
    potSize: null,
    roomId: null,
    userId: 'user-1',
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
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 0,
    wateringRating: 3,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potSize: null,
    roomId: null,
    userId: 'user-2',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: yesterday, // Overdue but belongs to user-2
      }),
    ],
  },
]

// Mock plants with no pending care tasks
export const mockPlantsNoCare: TestPlant[] = [
  {
    id: 'plant-no-care-1',
    name: 'No Care Plant',
    description: 'No pending care',
    imageUrl: null,
    category: 'tropical',
    dateAdded: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    humidityRating: 3,
    lightingRating: 3,
    petToxicityRating: 0,
    wateringRating: 3,
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    potSize: null,
    roomId: null,
    userId: 'user-1',
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: nextWeek, // Far in the future
      }),
    ],
  },
]
