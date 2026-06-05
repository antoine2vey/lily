import { readPlantResource } from '@lily/mcp/resources/plant'
import type { PlantDetail } from '@lily/shared/plant'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const basePlant: PlantDetail = {
  id: 'plant-1',
  name: 'Monstera Deliciosa',
  description: 'A beautiful tropical plant',
  imageUrl: 'https://example.com/monstera.jpg',
  category: 'tropical',
  dateAdded: new Date('2024-01-15'),
  updatedAt: new Date('2024-02-01'),
  humidityRating: 4,
  lightingRating: 3,
  petToxicityRating: 2,
  wateringRating: 3,
  health: 'HEALTHY',
  userId: 'user-1',
  roomId: 'room-1',
  potWidthCm: null,
  potHeightCm: null,
  remindersEnabled: true,
  isFavorite: false,
  room: {
    id: 'room-1',
    name: 'Living Room',
    icon: '🛋️',
    luminosity: 4,
    orientation: null,
    isOutdoor: false,
  },
  ownership: 'owned',
  ownerName: null,
  schedules: [
    {
      careType: 'watering',
      frequencyDays: 7,
      lastCareAt: new Date('2024-02-01'),
      nextCareAt: new Date('2024-02-08'),
    },
    {
      careType: 'fertilization',
      frequencyDays: 30,
      lastCareAt: null,
      nextCareAt: null,
    },
  ],
  photos: [],
}

describe('readPlantResource', () => {
  it('should return JSON with all plant fields', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    expect(parsed.id).toBe('plant-1')
    expect(parsed.name).toBe('Monstera Deliciosa')
    expect(parsed.category).toBe('tropical')
    expect(parsed.health).toBe('HEALTHY')
    expect(parsed.description).toBe('A beautiful tropical plant')
    expect(parsed.imageUrl).toBe('https://example.com/monstera.jpg')
  })

  it('should include room details', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    expect(parsed.room).toEqual({
      name: 'Living Room',
      icon: '🛋️',
    })
  })

  it('should return null room when plant has no room', async () => {
    const plantNoRoom: PlantDetail = {
      ...basePlant,
      roomId: null,
      room: null,
    }

    const result = await Effect.runPromise(readPlantResource(plantNoRoom))
    const parsed = JSON.parse(result)

    expect(parsed.room).toBeNull()
  })

  it('should include ratings', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    expect(parsed.ratings).toEqual({
      watering: 3,
      lighting: 3,
      humidity: 4,
      petToxicity: 2,
    })
  })

  it('should include schedule details with ISO dates', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    expect(parsed.schedules).toHaveLength(2)
    expect(parsed.schedules[0].careType).toBe('watering')
    expect(parsed.schedules[0].frequencyDays).toBe(7)
    expect(parsed.schedules[0].lastCareAt).toBe('2024-02-01')
    expect(parsed.schedules[0].nextCareAt).toBe('2024-02-08')
  })

  it('should return null for missing schedule dates', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    const fertSchedule = parsed.schedules[1]
    expect(fertSchedule.careType).toBe('fertilization')
    expect(fertSchedule.lastCareAt).toBeNull()
    expect(fertSchedule.nextCareAt).toBeNull()
  })

  it('should include dateAdded as ISO string', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))
    const parsed = JSON.parse(result)

    expect(parsed.dateAdded).toContain('2024-01-15')
  })

  it('should produce valid JSON', async () => {
    const result = await Effect.runPromise(readPlantResource(basePlant))

    expect(() => JSON.parse(result)).not.toThrow()
  })
})
