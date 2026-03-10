import { z } from 'zod'

const SourceSchema = z.object({
  url: z.string().describe('The full URL of the source article or webpage'),
  title: z.string().describe('The headline or title of the source article'),
  snippet: z
    .string()
    .describe(
      'A 2-3 sentence excerpt capturing the most relevant facts from this source for the blog topic'
    ),
})

export const ResearchBriefSchema = z.object({
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
