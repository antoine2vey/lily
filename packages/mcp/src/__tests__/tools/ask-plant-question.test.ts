import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { CurrentJwt } from '@lily/mcp/api-client'
import { askPlantQuestionEffect } from '@lily/mcp/tools/ask-plant-question'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const JWT = 'test-jwt'
const JwtLayer = Layer.succeed(CurrentJwt, JWT)

describe('askPlantQuestion MCP tool', () => {
  it('should return knowledge with sources', async () => {
    const layer = Layer.merge(
      createMockApiClient({
        queryKnowledge: () =>
          Effect.succeed({
            answer: 'Monstera plants prefer bright indirect light.',
            sources: [
              {
                title: 'Plant Guide',
                content: 'Monstera care tips',
                similarity: 0.95,
              },
              {
                title: 'Care Tips',
                content: 'Water every 1-2 weeks',
                similarity: 0.88,
              },
            ],
          }),
      }),
      JwtLayer
    )

    const result = await Effect.runPromise(
      askPlantQuestionEffect({
        question: 'How to care for Monstera?',
      }).pipe(Effect.provide(layer))
    )

    expect(result).toContain('Monstera plants prefer bright indirect light')
    expect(result).toContain('Sources')
    expect(result).toContain('Plant Guide')
    expect(result).toContain('95%')
  })

  it('should return "no info found" when sources empty', async () => {
    const layer = Layer.merge(
      createMockApiClient({
        queryKnowledge: () => Effect.succeed({ answer: '', sources: [] }),
      }),
      JwtLayer
    )

    const result = await Effect.runPromise(
      askPlantQuestionEffect({ question: 'obscure question' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toContain('No relevant information found')
  })
})
