import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AIIdentifyResponse,
  CareMultiplePlantsRequest,
  CareMultiplePlantsResult,
  EnhancedPlantCreateRequest,
  Plant,
  PlantCareRequest,
  PlantDetail,
  PlantPhoto,
  PlantsListResponse,
  PlantUpdateRequest,
} from '../domains/plant/schema'

// Test fixtures - use ISO strings for dates as that's what the schema expects for decoding
const validPlant = {
  id: 'plant-123',
  name: 'Monstera',
  description: 'A beautiful plant',
  imageUrl: 'https://example.com/image.jpg',
  category: 'Tropical',
  dateAdded: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
  humidityRating: 3,
  lightingRating: 2,
  petToxicityRating: 4,
  wateringRating: 3,
  health: 'HEALTHY' as const,
  remindersEnabled: true,
  isFavorite: false,
  userId: 'user-456',
  potWidthCm: null,
  potHeightCm: null,
  roomId: null,
  room: null,
  schedules: [
    {
      careType: 'watering' as const,
      frequencyDays: 7,
      lastCareAt: '2024-01-10T00:00:00.000Z',
      nextCareAt: '2024-01-17T00:00:00.000Z',
    },
    {
      careType: 'fertilization' as const,
      frequencyDays: 30,
      lastCareAt: '2024-01-01T00:00:00.000Z',
      nextCareAt: '2024-01-31T00:00:00.000Z',
    },
  ],
}

describe('Plant Schemas', () => {
  describe('Plant', () => {
    it('should decode a valid plant', () => {
      const result = Schema.decodeSync(Plant)(validPlant)

      expect(result.id).toBe('plant-123')
      expect(result.name).toBe('Monstera')
      expect(result.health).toBe('HEALTHY')
    })

    it('should accept all health statuses', () => {
      const healthStatuses = [
        'THRIVING',
        'HEALTHY',
        'NEEDS_ATTENTION',
        'SICK',
        'RECOVERING',
      ] as const

      for (const health of healthStatuses) {
        const plant = { ...validPlant, health }
        const result = Schema.decodeSync(Plant)(plant)
        expect(result.health).toBe(health)
      }
    })

    it('should reject invalid health status', () => {
      const plant = { ...validPlant, health: 'DEAD' as unknown }

      expect(() => Schema.decodeSync(Plant)(plant as never)).toThrow()
    })

    it('should accept null for nullable fields', () => {
      const plant = {
        ...validPlant,
        description: null,
        imageUrl: null,
        category: null,
      }

      const result = Schema.decodeSync(Plant)(plant)

      expect(result.description).toBeNull()
      expect(result.imageUrl).toBeNull()
      expect(result.category).toBeNull()
    })

    it('should reject missing required fields', () => {
      const { name: _name, ...plantWithoutName } = validPlant

      expect(() =>
        Schema.decodeSync(Plant)(plantWithoutName as never)
      ).toThrow()
    })

    it('should require boolean fields', () => {
      const result = Schema.decodeSync(Plant)(validPlant)

      expect(typeof result.remindersEnabled).toBe('boolean')
      expect(typeof result.isFavorite).toBe('boolean')
    })
  })

  describe('PlantUpdateRequest', () => {
    it('should decode an empty update request', () => {
      const result = Schema.decodeSync(PlantUpdateRequest)({})

      expect(result).toEqual({})
    })

    it('should decode partial updates', () => {
      const request = {
        name: 'Updated Name',
        isFavorite: true,
      }

      const result = Schema.decodeSync(PlantUpdateRequest)(request)

      expect(result.name).toBe('Updated Name')
      expect(result.isFavorite).toBe(true)
    })

    it('should accept all optional fields', () => {
      const request = {
        name: 'Updated Name',
        description: 'New description',
        category: 'Updated category',
        imageUrl: 'https://new-url.com/image.jpg',
        wateringFrequencyDays: 10,
        humidityRating: 4,
        lightingRating: 3,
        petToxicityRating: 2,
        wateringRating: 5,
        isFavorite: true,
      }

      const result = Schema.decodeSync(PlantUpdateRequest)(request)

      expect(result.name).toBe('Updated Name')
      expect(result.wateringFrequencyDays).toBe(10)
    })
  })

  describe('PlantCareRequest', () => {
    it('should decode a watering request', () => {
      const request = { careType: 'watering' as const }
      const result = Schema.decodeSync(PlantCareRequest)(request)
      expect(result.careType).toBe('watering')
    })

    it('should decode request with all care types', () => {
      const careTypes = [
        'watering',
        'fertilization',
        'misting',
        'repotting',
      ] as const

      for (const careType of careTypes) {
        const result = Schema.decodeSync(PlantCareRequest)({ careType })
        expect(result.careType).toBe(careType)
      }
    })

    it('should decode request with optional fields', () => {
      const request = {
        careType: 'misting' as const,
        notes: 'Misted the leaves',
        date: '2024-01-15T00:00:00.000Z',
      }
      const result = Schema.decodeSync(PlantCareRequest)(request)
      expect(result.careType).toBe('misting')
      expect(result.notes).toBe('Misted the leaves')
    })
  })

  describe('EnhancedPlantCreateRequest', () => {
    it('should decode minimal required fields', () => {
      const request = {
        name: 'Fern',
        wateringFrequencyDays: 3,
        luxNeeded: 2000,
        petToxicityRating: 1,
      }

      const result = Schema.decodeSync(EnhancedPlantCreateRequest)(request)

      expect(result.name).toBe('Fern')
      expect(result.luxNeeded).toBe(2000)
    })

    it('should decode with all optional fields', () => {
      const request = {
        name: 'Fern',
        description: 'A delicate fern',
        category: 'Indoor',
        imageUrl: 'https://example.com/fern.jpg',
        plantingDate: '2024-01-01T00:00:00.000Z',
        wateringFrequencyDays: 3,
        fertilizationFrequencyDays: 60,
        luxNeeded: 2000,
        humidityRating: 4,
        petToxicityRating: 1,
        remindersEnabled: true,
      }

      const result = Schema.decodeSync(EnhancedPlantCreateRequest)(request)

      expect(result.description).toBe('A delicate fern')
      expect(result.fertilizationFrequencyDays).toBe(60)
      expect(result.remindersEnabled).toBe(true)
    })
  })

  describe('AIIdentifyResponse', () => {
    it('should decode a successful identification', () => {
      const response = {
        name: 'Monstera deliciosa',
        family: 'Araceae',
        confidence: 0.95,
        alternatives: [
          { name: 'Monstera adansonii', confidence: 0.8 },
          { name: 'Philodendron', confidence: 0.6 },
        ],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 4,
        petToxicityRating: 3,
        fertilizationFrequencyDays: 30,
        mistingFrequencyDays: 2,
        repottingFrequencyDays: 365,
        category: 'Tropical',
        description: 'A popular houseplant with split leaves',
        wateringTips: 'Let soil dry between waterings. Reduce in winter.',
        potSizeCm: 20,
        potSize: 'M',
        imageUrl: 'https://example.com/identified.jpg',
      }

      const result = Schema.decodeSync(AIIdentifyResponse)(response)

      expect(result.name).toBe('Monstera deliciosa')
      expect(result.confidence).toBe(0.95)
      expect(result.alternatives).toHaveLength(2)
    })

    it('should accept null for uncertain identifications', () => {
      const response = {
        name: null,
        family: null,
        confidence: 0.2,
        alternatives: [],
        wateringFrequencyDays: null,
        luxNeeded: null,
        humidityRating: null,
        petToxicityRating: null,
        fertilizationFrequencyDays: null,
        mistingFrequencyDays: null,
        repottingFrequencyDays: null,
        category: null,
        description: null,
        wateringTips: null,
        potSizeCm: null,
        potSize: null,
        imageUrl: 'https://example.com/unknown.jpg',
      }

      const result = Schema.decodeSync(AIIdentifyResponse)(response)

      expect(result.name).toBeNull()
      expect(result.alternatives).toHaveLength(0)
    })

    it('should require imageUrl', () => {
      const response = {
        name: 'Test',
        family: null,
        confidence: 0.5,
        alternatives: [],
        wateringFrequencyDays: null,
        luxNeeded: null,
        humidityRating: null,
        petToxicityRating: null,
        fertilizationFrequencyDays: null,
        mistingFrequencyDays: null,
        repottingFrequencyDays: null,
        category: null,
        description: null,
        // Missing imageUrl
      }

      expect(() =>
        Schema.decodeSync(AIIdentifyResponse)(response as never)
      ).toThrow()
    })
  })

  describe('PlantPhoto', () => {
    it('should decode a valid photo', () => {
      const photo = {
        id: 'photo-123',
        url: 'https://example.com/photo.jpg',
        takenAt: '2024-01-15T00:00:00.000Z',
        plantId: 'plant-456',
      }

      const result = Schema.decodeSync(PlantPhoto)(photo)

      expect(result.id).toBe('photo-123')
      expect(result.url).toBe('https://example.com/photo.jpg')
    })

    it('should reject missing fields', () => {
      const photo = {
        id: 'photo-123',
        url: 'https://example.com/photo.jpg',
        // Missing takenAt and plantId
      }

      expect(() => Schema.decodeSync(PlantPhoto)(photo as never)).toThrow()
    })
  })

  describe('PlantsListResponse', () => {
    it('should decode a paginated plants response', () => {
      const response = {
        items: [validPlant],
        total: 50,
        page: 1,
        limit: 20,
        hasMore: true,
      }

      const result = Schema.decodeSync(PlantsListResponse)(response)

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.name).toBe('Monstera')
      expect(result.hasMore).toBe(true)
    })

    it('should decode empty list', () => {
      const response = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      }

      const result = Schema.decodeSync(PlantsListResponse)(response)

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe('PlantDetail', () => {
    it('should decode a plant with photos', () => {
      const detail = {
        ...validPlant,
        photos: [
          {
            id: 'photo-1',
            url: 'https://example.com/photo1.jpg',
            takenAt: '2024-01-10T00:00:00.000Z',
            plantId: 'plant-123',
          },
          {
            id: 'photo-2',
            url: 'https://example.com/photo2.jpg',
            takenAt: '2024-01-15T00:00:00.000Z',
            plantId: 'plant-123',
          },
        ],
      }

      const result = Schema.decodeSync(PlantDetail)(detail)

      expect(result.name).toBe('Monstera')
      expect(result.photos).toHaveLength(2)
    })

    it('should decode a plant with empty photos', () => {
      const detail = {
        ...validPlant,
        photos: [],
      }

      const result = Schema.decodeSync(PlantDetail)(detail)

      expect(result.photos).toHaveLength(0)
    })
  })

  describe('CareMultiplePlantsRequest', () => {
    it('should decode request with plant IDs and care type', () => {
      const request = {
        plantIds: ['plant-1', 'plant-2', 'plant-3'],
        careType: 'watering' as const,
      }

      const result = Schema.decodeSync(CareMultiplePlantsRequest)(request)

      expect(result.plantIds).toHaveLength(3)
      expect(result.careType).toBe('watering')
    })

    it('should accept all care types', () => {
      const careTypes = [
        'watering',
        'fertilization',
        'misting',
        'repotting',
      ] as const

      for (const careType of careTypes) {
        const result = Schema.decodeSync(CareMultiplePlantsRequest)({
          plantIds: ['plant-1'],
          careType,
        })
        expect(result.careType).toBe(careType)
      }
    })
  })

  describe('CareMultiplePlantsResult', () => {
    it('should decode successful result with plant', () => {
      const result = {
        plantId: 'plant-1',
        success: true,
        plant: validPlant,
      }

      const decoded = Schema.decodeSync(CareMultiplePlantsResult)(result)

      expect(decoded.success).toBe(true)
      expect(decoded.plant?.name).toBe('Monstera')
    })

    it('should decode failed result without plant', () => {
      const result = {
        plantId: 'plant-1',
        success: false,
      }

      const decoded = Schema.decodeSync(CareMultiplePlantsResult)(result)

      expect(decoded.success).toBe(false)
      expect(decoded.plant).toBeUndefined()
    })
  })
})
