import {
  extractPlantMentions,
  extractPrimaryPlantType,
} from '@lily/api/services/knowledge-ingestion/processing/plant-extractor'
import { describe, expect, it } from 'vitest'

describe('extractPlantMentions', () => {
  it('should return empty array when no plants are mentioned', () => {
    const content =
      'This is a general article about gardening tools and techniques.'
    expect(extractPlantMentions(content)).toEqual([])
  })

  it('should extract a single plant mention', () => {
    const content = 'My monstera is growing really well this spring.'
    expect(extractPlantMentions(content)).toContain('monstera')
  })

  it('should extract multiple plant mentions', () => {
    const content =
      'I have a pothos, a snake plant, and a peace lily in my living room.'
    const mentions = extractPlantMentions(content)
    expect(mentions).toContain('pothos')
    expect(mentions).toContain('snake plant')
    expect(mentions).toContain('peace lily')
  })

  it('should be case-insensitive', () => {
    const content = 'My MONSTERA DELICIOSA is huge! I also have a Pothos.'
    const mentions = extractPlantMentions(content)
    expect(mentions).toContain('monstera deliciosa')
    expect(mentions).toContain('pothos')
  })

  it('should return unique results', () => {
    const content =
      'My monstera is great. I love my monstera. Another monstera update.'
    const mentions = extractPlantMentions(content)
    const monsteraCount = mentions.filter((m) => m === 'monstera').length
    expect(monsteraCount).toBe(1)
  })

  it('should match longest names first (sorted longest-first)', () => {
    const content = 'I love my monstera deliciosa plant.'
    const mentions = extractPlantMentions(content)
    // 'monstera deliciosa' should come before 'monstera' in the results
    const deliciosaIdx = mentions.indexOf('monstera deliciosa')
    const monsteraIdx = mentions.indexOf('monstera')
    expect(deliciosaIdx).toBeLessThan(monsteraIdx)
  })

  it('should match multi-word plant names', () => {
    const content = 'The fiddle leaf fig and bird of paradise are my favorites.'
    const mentions = extractPlantMentions(content)
    expect(mentions).toContain('fiddle leaf fig')
    expect(mentions).toContain('bird of paradise')
  })

  it('should handle empty string', () => {
    expect(extractPlantMentions('')).toEqual([])
  })
})

describe('extractPrimaryPlantType', () => {
  it('should return the longest match as primary plant type', () => {
    const content =
      'My aloe vera needs more sunlight. I also have regular aloe.'
    const primary = extractPrimaryPlantType(content)
    expect(primary).toBe('aloe vera')
  })

  it('should return undefined when no plants are found', () => {
    const content = 'This article discusses general garden tools.'
    expect(extractPrimaryPlantType(content)).toBeUndefined()
  })

  it('should return the single mentioned plant', () => {
    const content = 'How to care for a spider plant properly.'
    expect(extractPrimaryPlantType(content)).toBe('spider plant')
  })

  it('should return the most specific name when both specific and generic match', () => {
    const content =
      'The golden pothos is a variety of pothos that grows quickly.'
    const primary = extractPrimaryPlantType(content)
    expect(primary).toBe('golden pothos')
  })
})
