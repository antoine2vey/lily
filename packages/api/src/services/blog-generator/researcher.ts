import { openai } from '@ai-sdk/openai'
import { FAST_MODEL } from '@lily/api/services/ai/models'
import { generateText, Output } from 'ai'
import { Effect } from 'effect'
import { mapOpenAIError } from './errors'
import { RESEARCH_PROMPT } from './prompts'
import { ResearchBriefSchema } from './schemas'
import type { ResearchBrief, TopicSuggestion } from './types'

export const researchTopic = (topic: TopicSuggestion) =>
  Effect.gen(function* () {
    // Use GPT-4o to research and produce structured output in a single call
    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
          model: openai(FAST_MODEL),
          output: Output.object({ schema: ResearchBriefSchema }),
          system: RESEARCH_PROMPT,
          prompt: `Research the topic "${topic.title.en}" for a plant care blog post.

Topic category: ${topic.category}
Suggested outline: ${topic.outline}

Find 5-8 authoritative sources about this topic. For each source, extract:
- The URL
- The title/headline
- Key facts, unique data points, and expert insights

Then synthesize a research brief with:
1. sources: Array of { url, title, snippet } for each source found
2. keyFacts: A bullet-point summary of the most important facts
3. uniqueAngles: Unique perspectives or angles that could make the blog post stand out`,
        }),
      catch: mapOpenAIError('Topic research'),
    })

    return result.output as ResearchBrief
  }).pipe(
    Effect.withSpan('blog-generator.researchTopic', {
      attributes: { 'topic.slug': topic.slug },
    })
  )
