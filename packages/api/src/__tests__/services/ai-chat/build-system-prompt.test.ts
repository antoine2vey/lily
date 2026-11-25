import { buildPlantSystemPrompt } from '@lily/api/services/ai-chat/build-system-prompt'
import { ZoneName } from '@lily/shared'
import { DateTime } from 'effect'
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
    timezone: ZoneName.make('UTC'),
    now: DateTime.makeUnsafe('2026-06-10T08:00:00Z'),
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

describe('buildPlantSystemPrompt schedules', () => {
  // The care store keeps `nextCareAt` at the local midnight of the due day.
  it.each([
    {
      zone: 'Europe/Paris',
      now: '2026-06-10T08:00:00Z',
      nextCareAt: '2026-06-10T22:00:00Z',
      expected: 'Next watering: Tomorrow',
    },
    {
      zone: 'Europe/Paris',
      now: '2026-06-10T22:30:00Z',
      nextCareAt: '2026-06-10T22:00:00Z',
      expected: 'Next watering: Today',
    },
    {
      zone: 'America/New_York',
      now: '2026-06-11T02:00:00Z',
      nextCareAt: '2026-06-11T04:00:00Z',
      expected: 'Next watering: Tomorrow',
    },
  ])('counts the next care in $zone days at $now', (row) => {
    const prompt = buildPlantSystemPrompt({
      plant: {
        name: 'Calathea',
        category: 'Tropical',
        description: null,
        health: 'HEALTHY',
        humidityRating: 80,
        lightingRating: 30,
        wateringRating: 60,
        petToxicityRating: 30,
        schedules: [
          {
            careType: 'watering',
            frequencyDays: 7,
            lastCareAt: null,
            nextCareAt: new Date(row.nextCareAt),
          },
        ],
      },
      daysSinceAdded: 10,
      careHistoryText: '',
      timezone: row.zone,
      now: DateTime.makeUnsafe(row.now),
    })

    expect(prompt).toContain(row.expected)
  })
})
