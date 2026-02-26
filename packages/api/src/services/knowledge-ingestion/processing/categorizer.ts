import type { ContentCategory } from '@lily/shared/knowledge'
import { Array, Option, Order, pipe, String } from 'effect'

interface CategoryKeywords {
  readonly category: ContentCategory
  readonly keywords: readonly string[]
}

const CATEGORY_KEYWORDS: readonly CategoryKeywords[] = [
  {
    category: 'watering_advice',
    keywords: [
      'watering',
      'water schedule',
      'overwatering',
      'underwatering',
      'moisture',
      'drought',
      'soggy',
      'dry soil',
      'root rot',
      'water frequency',
      'bottom watering',
      'misting',
      'humidity tray',
    ],
  },
  {
    category: 'pest_identification',
    keywords: [
      'pest',
      'insect',
      'bug',
      'spider mite',
      'mealybug',
      'aphid',
      'scale',
      'fungus gnat',
      'thrip',
      'whitefly',
      'neem oil',
      'insecticidal soap',
      'infestation',
    ],
  },
  {
    category: 'disease_diagnosis',
    keywords: [
      'disease',
      'fungal',
      'bacterial',
      'virus',
      'blight',
      'mildew',
      'rot',
      'wilt',
      'leaf spot',
      'yellowing',
      'browning',
      'drooping',
      'fungicide',
    ],
  },
  {
    category: 'light_requirements',
    keywords: [
      'light',
      'sunlight',
      'indirect light',
      'direct sun',
      'low light',
      'bright light',
      'shade',
      'grow light',
      'artificial light',
      'window',
      'south facing',
      'north facing',
      'etiolation',
      'leggy',
    ],
  },
  {
    category: 'soil_nutrients',
    keywords: [
      'soil',
      'fertilizer',
      'nutrient',
      'potting mix',
      'compost',
      'perlite',
      'vermiculite',
      'peat',
      'coco coir',
      'drainage',
      'repotting',
      'pot size',
      'nitrogen',
      'phosphorus',
      'potassium',
      'npk',
    ],
  },
  {
    category: 'propagation',
    keywords: [
      'propagation',
      'propagate',
      'cutting',
      'stem cutting',
      'leaf cutting',
      'division',
      'offset',
      'air layering',
      'rooting hormone',
      'water propagation',
      'node',
    ],
  },
  {
    category: 'general_care',
    keywords: [
      'care',
      'plant care',
      'tips',
      'advice',
      'beginner',
      'maintenance',
      'pruning',
      'cleaning',
      'temperature',
      'humidity',
      'growth',
      'dormancy',
      'seasonal',
    ],
  },
]

/**
 * Categorize content based on keyword matching.
 * Returns the category with the most keyword matches.
 */
export const categorize = (content: string): ContentCategory => {
  const lower = String.toLowerCase(content)

  const scores = Array.map(CATEGORY_KEYWORDS, (cat) => ({
    category: cat.category,
    score: pipe(
      cat.keywords,
      Array.filter((kw) => pipe(lower, String.includes(kw))),
      Array.length
    ),
  }))

  const byScoreDesc = Order.mapInput(
    Order.reverse(Order.number),
    (s: { score: number }) => s.score
  )

  const sorted = pipe(scores, Array.sort(byScoreDesc))

  return pipe(
    Array.head(sorted),
    Option.filter((s) => s.score > 0),
    Option.map((s) => s.category),
    Option.getOrElse(() => 'general_care' as const)
  )
}
