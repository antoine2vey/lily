import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { Effect } from 'effect'
import { z } from 'zod'
import { RESEARCH_PROMPT } from './prompts'
import type { ResearchBrief, TopicSuggestion } from './types'

const SourceSchema = z.object({
  url: z.string().describe('The full URL of the source article or webpage'),
  title: z.string().describe('The headline or title of the source article'),
  snippet: z
    .string()
    .describe(
      'A 2-3 sentence excerpt capturing the most relevant facts from this source for the blog topic'
    ),
})

const ResearchBriefSchema = z.object({
  sources: z
    .array(SourceSchema)
    .describe('5-8 authoritative sources found during research'),
  keyFacts: z
    .string()
    .describe(
      'Bullet-point summary of the most important, verified facts across all sources. Include specific numbers, measurements, or expert recommendations.'
    ),
  uniqueAngles: z
    .string()
    .describe(
      'Unique perspectives, contrarian views, or lesser-known tips that could differentiate the blog post from existing content'
    ),
})

export const researchTopic = (topic: TopicSuggestion) =>
  Effect.gen(function* () {
    // Use GPT-4o to research and synthesize knowledge on the topic
    const searchResult = yield* Effect.tryPromise(() =>
      generateText({
        model: openai('gpt-4o'),
        system: RESEARCH_PROMPT,
        prompt: `Research the topic "${topic.title.en}" for a plant care blog post.

Topic category: ${topic.category}
Suggested outline: ${topic.outline}

Find 5-8 authoritative sources about this topic. For each source, extract:
- The URL
- The title/headline
- Key facts, unique data points, and expert insights

Then synthesize a research brief with:
1. Key facts discovered across all sources
2. Unique angles or perspectives that could make the blog post stand out`,
      })
    )

    // Parse the research into structured format
    const brief = yield* Effect.tryPromise(() =>
      generateText({
        model: openai('gpt-4o'),
        output: Output.object({ schema: ResearchBriefSchema }),
        prompt: `Parse the following research output into a structured format.

Research output:
${searchResult.text}

Extract:
1. sources: Array of { url, title, snippet } for each source found
2. keyFacts: A bullet-point summary of the most important facts
3. uniqueAngles: Unique perspectives or angles for the blog post`,
      })
    )

    return brief.output as ResearchBrief
  }).pipe(
    Effect.withSpan('blog-generator.researchTopic', {
      attributes: { 'topic.slug': topic.slug },
    })
  )
