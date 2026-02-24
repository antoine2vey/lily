import { chunkContent } from '@lily/api/services/knowledge-ingestion/processing/chunker'
import { describe, expect, it } from 'vitest'

describe('chunkContent', () => {
  it('should return empty array for empty string', () => {
    expect(chunkContent('')).toEqual([])
  })

  it('should return empty array for whitespace-only input', () => {
    expect(chunkContent('   \n\n  \t  ')).toEqual([])
  })

  it('should return empty array for content below MIN_SIZE (100 chars)', () => {
    const short = 'This is a short text about plants.'
    expect(short.length).toBeLessThan(100)
    expect(chunkContent(short)).toEqual([])
  })

  it('should return single chunk for content within MAX_SIZE (700 chars)', () => {
    const content = 'A'.repeat(500)
    const chunks = chunkContent(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe(content)
  })

  it('should return single chunk for content exactly at MIN_SIZE boundary', () => {
    const content = 'A'.repeat(100)
    const chunks = chunkContent(content)
    expect(chunks).toHaveLength(1)
  })

  it('should split long content into multiple chunks', () => {
    const paragraph = 'This is a paragraph about plant care. '.repeat(30)
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`
    expect(content.length).toBeGreaterThan(700)

    const chunks = chunkContent(content)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('should keep chunk sizes within MAX_SIZE (2500 chars)', () => {
    const paragraph =
      'Plants need water and sunlight to grow properly. '.repeat(40)
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`

    const chunks = chunkContent(content)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(700)
    }
  })

  it('should split on paragraph boundaries (double newlines)', () => {
    const para1 = 'A'.repeat(500)
    const para2 = 'B'.repeat(500)
    const content = `${para1}\n\n${para2}`

    const chunks = chunkContent(content)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('should split on markdown headers', () => {
    const section1 = `## Watering Guide\n${'Water your plants regularly. '.repeat(40)}`
    const section2 = `## Light Requirements\n${'Most plants need bright indirect light. '.repeat(40)}`
    const content = `${section1}\n\n${section2}`

    const chunks = chunkContent(content)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('should force-split long paragraphs without natural boundaries', () => {
    const longParagraph = 'A'.repeat(2000)
    const chunks = chunkContent(longParagraph)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(700)
    }
  })

  it('should produce chunks at or above MIN_SIZE (200 chars)', () => {
    const content =
      'This is a sentence about caring for houseplants and their needs. '.repeat(
        50
      )
    const chunks = chunkContent(content)
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThanOrEqual(100)
    }
  })

  it('should include overlap between consecutive chunks', () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) =>
        `Sentence number ${i} about plant care tips and tricks for beginners.`
    )
    const content = sentences.join('. ')

    const chunks = chunkContent(content)
    if (chunks.length >= 2) {
      const first = chunks[0]
      const second = chunks[1]
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      // The end of chunk N should overlap with the start of chunk N+1
      const endOfFirst = (first as string).slice(-50)
      const startOfSecond = (second as string).slice(0, 200)
      // Some characters from end of first chunk should appear in start of second
      expect(startOfSecond).toContain(endOfFirst.slice(-20).trim())
    }
  })

  it('should handle content with mixed markdown formatting', () => {
    const content = [
      '# Plant Care Guide',
      '',
      'Introduction paragraph. '.repeat(20),
      '',
      '## Watering',
      '',
      'Watering details paragraph. '.repeat(20),
      '',
      '## Lighting',
      '',
      'Lighting details paragraph. '.repeat(20),
    ].join('\n')

    const chunks = chunkContent(content)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(700)
    }
  })
})
