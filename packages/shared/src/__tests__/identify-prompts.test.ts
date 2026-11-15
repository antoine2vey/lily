import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  plantCardScan,
  plantCardScanMultiple,
} from '../services/ai/plant-card-scan'
import { plantDetect } from '../services/ai/plant-detect'
import { plantRecognition } from '../services/ai/plant-recognition'
import { rarityInstructions } from '../services/ai/prompts'

const systemPrompts: string[] = []

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(async (options: { system: string }) => {
    systemPrompts.push(options.system)
    return {
      output: {
        name: 'Monstera obliqua',
        confidence: 0.9,
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 70,
        isRareHouseplant: true,
        detectedType: 'plant',
      },
    }
  }),
}))

beforeEach(() => {
  systemPrompts.length = 0
})

const IMAGE = 'https://example.com/plant.jpg'

const identifyCalls: ReadonlyArray<{
  readonly name: string
  readonly run: () => Effect.Effect<unknown, unknown>
}> = [
  { name: 'plantRecognition', run: () => plantRecognition(IMAGE) },
  { name: 'plantDetect', run: () => plantDetect(IMAGE) },
  { name: 'plantCardScan', run: () => plantCardScan(IMAGE) },
  {
    name: 'plantCardScanMultiple',
    run: () => plantCardScanMultiple([IMAGE, IMAGE]),
  },
]

describe('the rarity question in the identify prompts', () => {
  it('asks the model for isRareHouseplant', () => {
    expect(rarityInstructions).toContain('Also answer isRareHouseplant')
  })

  it.each(identifyCalls)('$name sends it to the model', async ({ run }) => {
    await Effect.runPromise(run())

    expect(systemPrompts).toHaveLength(1)
    expect(systemPrompts[0]).toContain(rarityInstructions)
  })
})
