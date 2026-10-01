import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import type { PlantAIResult } from '../services/ai/plant-schema'
import {
  isPlantResultSufficient,
  withQualityRetry,
} from '../services/ai/quality-check'

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
  mistingFrequencyDays: null,
  repottingFrequencyDays: null,
  category: 'Tropical',
  description: 'A tropical plant',
  wateringTips: 'Water weekly',
  potSizeCm: null,
  potSize: null,
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

describe('withQualityRetry', () => {
  const scripted = (results: ReadonlyArray<PlantAIResult>) => {
    let calls = 0
    const call = Effect.sync(() =>
      Option.getOrThrow(Array.get(results, calls++))
    )
    return { call, calls: () => calls }
  }

  it('returns the first sufficient result without retrying', async () => {
    const first = makeResult({ confidence: 0.4 })
    const { call, calls } = scripted([first, makeResult()])

    const result = await Effect.runPromise(withQualityRetry(call))

    expect(result).toBe(first)
    expect(calls()).toBe(1)
  })

  it('retries until a sufficient result arrives', async () => {
    const sufficient = makeResult({ confidence: 0.2 })
    const { call, calls } = scripted([
      makeResult({ name: null, confidence: 0.9 }),
      sufficient,
      makeResult(),
    ])

    const result = await Effect.runPromise(withQualityRetry(call))

    expect(result).toBe(sufficient)
    expect(calls()).toBe(2)
  })

  it('stops at maxAttempts and keeps the most confident insufficient result', async () => {
    const best = makeResult({ luxNeeded: null, confidence: 0.8 })
    const { call, calls } = scripted([
      makeResult({ name: null, confidence: 0.5 }),
      best,
      makeResult({ humidityRating: null, confidence: 0.6 }),
      makeResult(),
    ])

    const result = await Effect.runPromise(withQualityRetry(call, 3))

    expect(result).toBe(best)
    expect(calls()).toBe(3)
  })

  it('propagates the call failure', async () => {
    const result = await Effect.runPromise(
      Effect.flip(withQualityRetry(Effect.fail('boom' as const)))
    )

    expect(result).toBe('boom')
  })
})
