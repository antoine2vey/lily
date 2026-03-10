import { z } from 'zod'

export const TopicSchema = z.object({
  slug: z
    .string()
    .describe(
      'URL-friendly slug for the blog post (e.g. "how-to-propagate-pothos"). Must be unique and lowercase with hyphens.'
    ),
  title: z
    .object({
      en: z.string().describe('English title'),
      fr: z.string().describe('French title'),
    })
    .describe(
      'Localized blog post titles (e.g. { "en": "How to Propagate Pothos", "fr": "Comment bouturer un Pothos" })'
    ),
  category: z
    .string()
    .describe(
      'Blog post category from the available list (e.g. "care-guide", "troubleshooting", "seasonal")'
    ),
  tags: z
    .array(z.string())
    .describe(
      'Relevant tags for discoverability (e.g. ["propagation", "pothos", "beginner"])'
    ),
  outline: z
    .string()
    .describe(
      'A brief outline of 4-6 main sections the blog post should cover, as a numbered list'
    ),
})
