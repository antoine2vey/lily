import { RagService } from '@lily/api/services/rag/service'
import { tool } from 'ai'
import { Array, Effect, pipe, Runtime, String } from 'effect'
import { z } from 'zod'

import type { ToolDeps } from './index'

const FILLER_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'must',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'about',
  'into',
  'through',
  'and',
  'but',
  'or',
  'nor',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'not',
  'no',
  'my',
  'your',
  'its',
  'their',
  'our',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'we',
  'us',
  'it',
  'they',
  'them',
  'what',
  'which',
  'who',
  'whom',
  'how',
  'why',
  'when',
  'where',
  'very',
  'really',
  'just',
  'also',
  'too',
  'some',
  'any',
])

/**
 * Remove filler words and the plant name (if any) from a query,
 * keeping only substantive terms (nouns/adjectives).
 */
const simplify = (query: string, plantName: string | undefined): string =>
  pipe(
    String.toLowerCase(query),
    (s) =>
      plantName ? String.replaceAll(String.toLowerCase(plantName), '')(s) : s,
    String.split(/\s+/),
    Array.filter(
      (word) => word.length > 1 && !FILLER_WORDS.has(String.toLowerCase(word))
    ),
    Array.join(' '),
    String.trim
  )

export const searchPlantKnowledgeTool = (deps: ToolDeps) =>
  tool({
    description:
      'REQUIRED: You must call this tool before answering any plant care advice question. Search the knowledge base for real-world advice from experienced growers. Only skip for direct schedule/status lookups (e.g., "when is my next watering?"). Formulate your query in English.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Search query in English describing what information is needed'
        ),
    }),
    execute: async ({ query }) =>
      Runtime.runPromise(deps.runtime)(
        Effect.gen(function* () {
          const ragService = yield* RagService

          const simplified = simplify(query, deps.plantName)
          const queries = deps.plantName
            ? [
                `${deps.plantName}: ${query}`,
                `${deps.plantName}: ${simplified}`,
                simplified,
              ]
            : [query, simplified]

          for (const ragQuery of queries) {
            const chunks = yield* ragService.retrieve({
              query: ragQuery,
            })
            if (!Array.isEmptyArray(chunks)) {
              return ragService.formatContext(chunks)
            }
          }

          return 'No relevant knowledge base articles found. Answer based on your own plant care expertise.'
        })
      ),
  })
