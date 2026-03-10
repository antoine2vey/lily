import { openai } from '@ai-sdk/openai'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { generateText, Output } from 'ai'
import { Effect } from 'effect'
import { z } from 'zod'
import { TOPIC_SELECTION_PROMPT } from './prompts'
import { BLOG_CATEGORIES, type TopicSuggestion } from './types'

const TopicSchema = z.object({
  slug: z
    .string()
    .describe(
      'URL-friendly slug for the blog post (e.g. "how-to-propagate-pothos"). Must be unique and lowercase with hyphens.'
    ),
  title: z
    .record(z.string(), z.string())
    .describe(
      'Localized blog post titles keyed by language code (e.g. { "en": "How to Propagate Pothos", "fr": "Comment bouturer un Pothos" })'
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

const TOPIC_TEMPLATES = [
  'Complete care guide for [popular plant]',
  'How to propagate [plant] from cuttings',
  'Why your [plant] leaves are turning yellow',
  'Best indoor plants for low light conditions',
  'Seasonal plant care checklist for [season]',
  'How to repot your houseplants step by step',
  'Common pests and how to treat them naturally',
  'Understanding soil types for houseplants',
  'Water quality and its effect on plant health',
  'How to create a humidity-loving plant corner',
  'Beginner mistakes to avoid with houseplants',
  'How to revive a dying plant',
  'Best plants for air purification',
  'Fertilizing indoor plants: a complete guide',
  'How to choose the right pot for your plant',
  'Understanding plant light requirements',
  'How to care for succulents and cacti',
  'Tropical plants that thrive indoors',
  'Pet-safe houseplants for cat and dog owners',
  'How to start a kitchen herb garden',
  'Winter plant care tips',
  'Summer plant care tips',
  'Spring plant care tips',
  'Fall plant care tips',
  'How to deal with root rot',
  'Signs your plant needs more light',
  'How to create a self-watering system',
  'Best trailing plants for hanging baskets',
  'How to grow plants in water (hydroponics)',
  'Understanding plant dormancy',
  'How to prevent and treat fungal diseases',
  'Best plants for bathrooms',
  'How to acclimate new plants to your home',
  'Companion planting for indoor gardens',
  'How to prune houseplants correctly',
  'Understanding NPK ratios in fertilizers',
  'How to increase humidity for tropical plants',
  'Best plants for office desks',
  'How to read plant care labels',
  'Building a terrarium step by step',
  'Rare houseplants worth collecting',
  'How to overwinter outdoor plants indoors',
  'Natural pest control methods for houseplants',
  'How to grow edible plants indoors',
  'Understanding variegation in plants',
  'How to create a moss pole for climbing plants',
  'Best tools for plant care',
  'How to divide and separate root-bound plants',
  'Understanding photosynthesis for better plant care',
  'How to create a plant care schedule',
]

export const selectTopic = Effect.gen(function* () {
  const repo = yield* BlogPostRepository

  const existingSlugs = yield* repo.findAllSlugs()
  const recentCategories = yield* repo.findRecentCategories(10)

  const result = yield* Effect.tryPromise(() =>
    generateText({
      model: openai('gpt-4o'),
      output: Output.object({ schema: TopicSchema }),
      system: TOPIC_SELECTION_PROMPT,
      prompt: `Select a blog post topic for a plant care blog.

Available categories: ${BLOG_CATEGORIES.join(', ')}

Topic templates for inspiration (pick one or create your own):
${TOPIC_TEMPLATES.join('\n')}

ALREADY PUBLISHED slugs (avoid similar topics):
${existingSlugs.join('\n')}

RECENT categories (vary from these):
${recentCategories.join(', ')}

Today's date: ${new Date().toISOString().split('T')[0]}`,
    })
  )

  return result.output as TopicSuggestion
}).pipe(Effect.withSpan('blog-generator.selectTopic'))
