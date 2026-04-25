import { openai } from '@ai-sdk/openai'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { PlantCatalogRepository } from '@lily/api/repositories/plant-catalog.repository'
import { FAST_MODEL } from '@lily/api/services/ai/models'
import { nowAsIsoString } from '@lily/shared'
import { generateText, Output } from 'ai'
import { Array as Arr, Chunk, Effect, Random, String as Str } from 'effect'
import { mapOpenAIError } from './errors'
import { TOPIC_SELECTION_PROMPT } from './prompts'
import { TopicSchema } from './schemas'
import { BLOG_CATEGORIES, type TopicSuggestion } from './types'

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

const TEMPLATE_SAMPLE_SIZE = 12

const sampleN = <A>(items: ReadonlyArray<A>, n: number) =>
  Random.shuffle(items).pipe(
    Effect.map((shuffled) => Arr.take(Chunk.toReadonlyArray(shuffled), n))
  )

export const selectTopic = Effect.fn('blog-generator.selectTopic')(function* (
  attemptedSlugs: ReadonlyArray<string> = []
) {
  const repo = yield* BlogPostRepository
  const catalog = yield* PlantCatalogRepository

  const [existingSlugs, recentCategories, seedPlants] = yield* Effect.all(
    [
      repo.findAllSlugs(),
      repo.findRecentCategories(10),
      catalog.findRandomNames(1, 'en'),
    ],
    { concurrency: 'unbounded' }
  )

  const sampledTemplates = yield* sampleN(TOPIC_TEMPLATES, TEMPLATE_SAMPLE_SIZE)
  const seedPlantSection = Arr.isNonEmptyReadonlyArray(seedPlants)
    ? `\n\nSEED PLANT (lean toward this species unless it doesn't fit a fresh angle): ${seedPlants[0]}`
    : ''

  const attemptedSection = Arr.isNonEmptyReadonlyArray(attemptedSlugs)
    ? `\n\nALREADY ATTEMPTED THIS SESSION (just collided — DO NOT repick or pick a close variant):\n${Arr.join(attemptedSlugs, '\n')}`
    : ''

  const result = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: openai(FAST_MODEL),
        maxRetries: 0,
        temperature: 1.1,
        output: Output.object({ schema: TopicSchema }),
        system: TOPIC_SELECTION_PROMPT,
        prompt: `Select a blog post topic for a plant care blog.

FORBIDDEN SLUGS (already in DB — picking any of these voids the response):
${Arr.join(existingSlugs, '\n') || '(none yet)'}${attemptedSection}${seedPlantSection}

Available categories: ${Arr.join(BLOG_CATEGORIES, ', ')}

Topic templates for inspiration (sampled subset — feel free to invent your own):
${Arr.join(sampledTemplates, '\n')}

RECENT categories (vary from these):
${Arr.join(recentCategories, ', ')}

Today's date: ${Str.takeLeft(nowAsIsoString(), 10)}`,
      }),
    catch: mapOpenAIError('Topic selection'),
  })

  return result.output as TopicSuggestion
})
