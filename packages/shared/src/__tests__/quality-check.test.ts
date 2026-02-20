import { describe, expect, it } from 'vitest'
import type { PlantAIResult } from '../services/ai/plant-schema'
import { isPlantResultSufficient } from '../services/ai/quality-check'

const makeResult = (overrides: Partial<PlantAIResult> = {}): PlantAIResult => ({
  name: 'Monstera deliciosa',
  family: 'Araceae',
  confidence: 0.9,
  alternatives: [],
  wateringFrequencyDays: 7,
  luxNeeded: 2000,
  humidityRating: 60,
  petToxicityRating: 30,
  fertilizationFrequencyDays: 30,
  category: 'Tropical',
  description: 'A tropical plant',
  wateringTips: 'Water weekly',
  ...overrides,
})

describe('isPlantResultSufficient', () => {
  it('should return true when all required fields are present', () => {
    expect(isPlantResultSufficient(makeResult())).toBe(true)
  })

  it('should return false when name is null', () => {
    expect(isPlantResultSufficient(makeResult({ name: null }))).toBe(false)
  })

  it('should return false when wateringFrequencyDays is null', () => {
    expect(
      isPlantResultSufficient(makeResult({ wateringFrequencyDays: null }))
    ).toBe(false)
  })

  it('should return false when luxNeeded is null', () => {
    expect(isPlantResultSufficient(makeResult({ luxNeeded: null }))).toBe(false)
  })

  it('should return false when humidityRating is null', () => {
    expect(isPlantResultSufficient(makeResult({ humidityRating: null }))).toBe(
      false
    )
  })

  it('should return true even when optional fields are null', () => {
    expect(
      isPlantResultSufficient(
        makeResult({
          family: null,
          petToxicityRating: null,
          fertilizationFrequencyDays: null,
          category: null,
          description: null,
          wateringTips: null,
        })
      )
    ).toBe(true)
  })

  it('should return false when multiple required fields are null', () => {
    expect(
      isPlantResultSufficient(makeResult({ name: null, luxNeeded: null }))
    ).toBe(false)
  })
})
