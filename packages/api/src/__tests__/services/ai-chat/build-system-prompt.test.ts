import { buildPlantSystemPrompt } from '@lily/api/services/ai-chat/build-system-prompt'
import { describe, expect, it } from 'vitest'

const promptFor = (ratings: {
  readonly humidityRating: number
  readonly lightingRating: number
  readonly wateringRating: number
  readonly petToxicityRating: number
}) =>
  buildPlantSystemPrompt({
    plant: {
      name: 'Calathea',
      category: 'Tropical',
      description: null,
      health: 'HEALTHY',
      schedules: [],
      ...ratings,
    },
    daysSinceAdded: 10,
    careHistoryText: '',
  })

describe('buildPlantSystemPrompt care requirements', () => {
  it('prints each rating on the 0-100 scale it is stored on', () => {
    const prompt = promptFor({
      humidityRating: 80,
      lightingRating: 30,
      wateringRating: 60,
      petToxicityRating: 30,
    })

    expect(prompt).toContain('Humidity needs: 80/100')
    expect(prompt).toContain('Light requirements: 30/100')
    expect(prompt).toContain('Watering needs: 60/100')
    expect(prompt).toContain('Pet toxicity: 30/100')
    expect(prompt).not.toMatch(/\d+\/5\b/)
  })

  it('says whether the plant is safe for pets', () => {
    const ratings = {
      humidityRating: 50,
      lightingRating: 50,
      wateringRating: 50,
    }

    expect(promptFor({ ...ratings, petToxicityRating: 30 })).toContain(
      'safe for pets'
    )
    expect(promptFor({ ...ratings, petToxicityRating: 80 })).toContain(
      'toxic to pets'
    )
  })
})
