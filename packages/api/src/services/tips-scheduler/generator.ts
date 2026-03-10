import { openai } from '@ai-sdk/openai'
import { DailyTipRepository } from '@lily/api/repositories/daily-tip.repository'
import { RagService } from '@lily/api/services/rag/service'
import { TIP_CATEGORIES } from '@lily/api/services/tips-scheduler/types'
import { generateText, Output } from 'ai'
import { Array, Effect, Option, pipe, Random } from 'effect'
import { z } from 'zod'
import type { GeneratedTip } from './types'

const TipSchema = z.object({
  title: z
    .object({
      en: z.string().describe('English title'),
      fr: z.string().describe('French title'),
    })
    .describe(
      'Short, catchy tip title. Keep under 60 characters per language.'
    ),
  body: z
    .object({
      en: z.string().describe('English body'),
      fr: z.string().describe('French body'),
    })
    .describe(
      'Actionable tip body. Must be 280 characters or less per language (push notification friendly). Be specific and practical.'
    ),
  category: z
    .enum(TIP_CATEGORIES)
    .describe(
      'The plant care category this tip belongs to (e.g. "watering", "light", "pests")'
    ),
  tags: z
    .array(z.string())
    .describe(
      'Relevant tags for categorization (e.g. ["watering", "morning", "absorption"])'
    ),
})

export const generateDailyTip = Effect.gen(function* () {
  const tipRepo = yield* DailyTipRepository
  const ragService = yield* RagService

  // Get recent tips for dedup
  const recentTips = yield* tipRepo.findRecent(30)

  const recentTopics = pipe(
    recentTips,
    Array.map((t) => `${t.category}: ${t.title.en ?? ''}`)
  )

  // Pick a random category to guide RAG retrieval
  const randomIndex = yield* Random.nextIntBetween(
    0,
    Array.length(TIP_CATEGORIES)
  )
  const targetCategory = Option.getOrElse(
    Array.get(TIP_CATEGORIES, randomIndex),
    () => 'general' as const
  )

  // Use RAG to get relevant knowledge
  const chunks = yield* ragService.retrieve({
    query: `${targetCategory} plant care tips and advice`,
    limit: 3,
  })

  const knowledgeContext = ragService.formatContext(chunks)

  // Generate the tip
  const result = yield* Effect.tryPromise(() =>
    generateText({
      model: openai('gpt-4o-mini'),
      output: Output.object({ schema: TipSchema }),
      system: `You are a plant care expert generating a daily tip for a plant care app.

RULES:
- The body must be 280 characters or less per language (push notification friendly)
- The tip must be practical and actionable
- Write in a warm, encouraging tone
- Provide title and body as objects keyed by language code: { "en": "...", "fr": "..." }
- The French version should be a natural translation, not word-for-word
- Avoid repeating topics from recent tips
- Use the provided plant care knowledge to inform your tip`,
      prompt: `Generate a daily plant care tip.

Target category: ${targetCategory}

${knowledgeContext ? `Plant care knowledge context:\n${knowledgeContext}\n` : ''}
Recent tips (avoid repeating these topics):
${Array.join(recentTopics, '\n')}`,
    })
  )

  return result.output as GeneratedTip
}).pipe(Effect.withSpan('tips-scheduler.generateTip'))
