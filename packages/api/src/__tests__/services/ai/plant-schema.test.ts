import { detectSchema, plantSchema } from '@lily/api/services/ai/plant-schema'
import { describe, expect, it } from 'vitest'

describe('AI output schema rarity answer', () => {
  const modelOutput = {
    name: 'Pothos',
    family: 'Araceae',
    confidence: 0.92,
    alternatives: [],
    wateringFrequencyDays: 7,
    luxNeeded: 1000,
    humidityRating: 3,
    petToxicityRating: 3,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    category: 'Tropical',
    description: 'A trailing vine',
    wateringTips: 'Water when the top soil is dry.',
    potSizeCm: 15,
    potSize: 'S',
    isRareHouseplant: false,
  }

  it('should parse the boolean from the model', () => {
    expect(plantSchema.parse(modelOutput).isRareHouseplant).toBe(false)
    expect(
      plantSchema.parse({ ...modelOutput, isRareHouseplant: true })
        .isRareHouseplant
    ).toBe(true)
  })

  it('should require the answer on every identify schema', () => {
    const { isRareHouseplant: _, ...withoutAnswer } = modelOutput

    expect(plantSchema.safeParse(withoutAnswer).success).toBe(false)
    expect(detectSchema.shape.isRareHouseplant).toBeDefined()
  })
})
