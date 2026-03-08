import type { Plant } from '@lily/shared/plant'
import { makeSchedules } from 'src/__tests__/fixtures/plants'

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
export const mockPlantsForCareTasks: Plant[] = [
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
    userId: 'user-1',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: yesterday, // Overdue
      fertilizationFrequencyDays: 30,
      lastFertilizedAt: new Date('2024-01-01'),
      nextFertilizationAt: tomorrow, // This week
    }),
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
    userId: 'user-1',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 14,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: today, // Today
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
    health: 'HEALTHY',
    remindersEnabled: true,
    isFavorite: false,
    userId: 'user-1',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 10,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: inThreeDays, // This week
      fertilizationFrequencyDays: 14,
      lastFertilizedAt: null,
      nextFertilizationAt: inThreeDays, // This week
    }),
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
    userId: 'user-1',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 30,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: nextWeek, // Not this week
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    }),
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
    userId: 'user-2',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: yesterday, // Overdue but belongs to user-2
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    }),
  },
]

// Mock plants with no pending care tasks
export const mockPlantsNoCare: Plant[] = [
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
    userId: 'user-1',
    roomId: null,
    room: null,
    ownership: 'owned' as const,
    ownerName: null,
    schedules: makeSchedules({
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-01'),
      nextWateringAt: nextWeek, // Far in the future
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    }),
  },
]
