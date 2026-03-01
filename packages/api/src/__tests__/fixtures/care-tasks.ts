import type { plants } from '@lily/db/schema'

type PlantRecord = typeof plants.$inferSelect

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
export const mockPlantsForCareTasks: PlantRecord[] = [
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
    wateringFrequencyDays: 7,
    lastWateredAt: new Date('2024-01-10'),
    nextWateringAt: yesterday, // Overdue
    remindersEnabled: true,
    fertilizationFrequencyDays: 30,
    lastFertilizedAt: new Date('2024-01-01'),
    nextFertilizationAt: tomorrow, // This week
    isFavorite: false,
    roomId: null,
    userId: 'user-1',
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
    wateringFrequencyDays: 14,
    lastWateredAt: new Date('2024-01-01'),
    nextWateringAt: today, // Today
    remindersEnabled: true,
    fertilizationFrequencyDays: null,
    lastFertilizedAt: null,
    nextFertilizationAt: null,
    isFavorite: false,
    roomId: null,
    userId: 'user-1',
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
    wateringFrequencyDays: 10,
    lastWateredAt: new Date('2024-01-01'),
    nextWateringAt: inThreeDays, // This week
    remindersEnabled: true,
    fertilizationFrequencyDays: 14,
    lastFertilizedAt: null,
    nextFertilizationAt: inThreeDays, // This week
    isFavorite: false,
    roomId: null,
    userId: 'user-1',
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
    wateringFrequencyDays: 30,
    lastWateredAt: new Date('2024-01-01'),
    nextWateringAt: nextWeek, // Not this week
    remindersEnabled: true,
    fertilizationFrequencyDays: null,
    lastFertilizedAt: null,
    nextFertilizationAt: null,
    isFavorite: false,
    roomId: null,
    userId: 'user-1',
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
    wateringFrequencyDays: 7,
    lastWateredAt: new Date('2024-01-01'),
    nextWateringAt: yesterday, // Overdue but belongs to user-2
    remindersEnabled: true,
    fertilizationFrequencyDays: null,
    lastFertilizedAt: null,
    nextFertilizationAt: null,
    isFavorite: false,
    roomId: null,
    userId: 'user-2',
  },
]

// Mock plants with no pending care tasks
export const mockPlantsNoCare: PlantRecord[] = [
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
    wateringFrequencyDays: 7,
    lastWateredAt: new Date('2024-01-01'),
    nextWateringAt: nextWeek, // Far in the future
    remindersEnabled: true,
    fertilizationFrequencyDays: null,
    lastFertilizedAt: null,
    nextFertilizationAt: null,
    isFavorite: false,
    roomId: null,
    userId: 'user-1',
  },
]
