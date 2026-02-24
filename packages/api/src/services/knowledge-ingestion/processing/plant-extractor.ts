import { Array, Option, Order, pipe, String } from 'effect'

/**
 * Common houseplant names for mention extraction.
 * Sorted longest-first so multi-word names match before shorter substrings.
 */
const PLANT_NAMES = [
  'african violet',
  'alocasia',
  'aloe vera',
  'aloe',
  'anthurium',
  'areca palm',
  'asparagus fern',
  'bamboo palm',
  'begonia',
  'bird of paradise',
  'birds nest fern',
  'boston fern',
  'bromeliad',
  'burros tail',
  'cactus',
  'calathea',
  'cast iron plant',
  'chinese evergreen',
  'chinese money plant',
  'christmas cactus',
  'coleus',
  'corn plant',
  'croton',
  'cyclamen',
  'dracaena',
  'dumb cane',
  'dieffenbachia',
  'elephant ear',
  'english ivy',
  'fern',
  'ficus',
  'fiddle leaf fig',
  'flamingo flower',
  'gardenia',
  'golden pothos',
  'grape ivy',
  'haworthia',
  'hoya',
  'ivy',
  'jade plant',
  'jasmine',
  'kalanchoe',
  'lavender',
  'lemon tree',
  'lipstick plant',
  'lucky bamboo',
  'maidenhair fern',
  'maranta',
  'money tree',
  'monstera deliciosa',
  'monstera',
  'nerve plant',
  'norfolk island pine',
  'orchid',
  'palm',
  'parlor palm',
  'peace lily',
  'peperomia',
  'philodendron',
  'pilea',
  'polka dot plant',
  'ponytail palm',
  'pothos',
  'prayer plant',
  'purple heart',
  'rabbit foot fern',
  'rex begonia',
  'rosemary',
  'rubber plant',
  'rubber tree',
  'sago palm',
  'sansevieria',
  'schefflera',
  'snake plant',
  'spider plant',
  'string of hearts',
  'string of pearls',
  'succulent',
  'swiss cheese plant',
  'syngonium',
  'tradescantia',
  'umbrella plant',
  'venus fly trap',
  'wandering jew',
  'yucca',
  'zamioculcas',
  'zebra plant',
  'zz plant',
]

// Sort longest first for greedy matching
const byLengthDesc = Order.mapInput(
  Order.reverse(Order.number),
  (s: string) => s.length
)

const SORTED_NAMES = pipe(PLANT_NAMES, Array.sort(byLengthDesc))

/**
 * Extract plant mentions from text content.
 * Returns unique plant names found (lowercased).
 */
export const extractPlantMentions = (content: string): string[] => {
  const lower = String.toLowerCase(content)

  return pipe(
    SORTED_NAMES,
    Array.filter((name) => pipe(lower, String.includes(name))),
    Array.dedupe
  )
}

/**
 * Get the primary plant type from content.
 * Returns the most specific (longest) plant name found, or undefined.
 */
export const extractPrimaryPlantType = (
  content: string
): string | undefined => {
  const mentions = extractPlantMentions(content)
  return pipe(Array.head(mentions), Option.getOrUndefined)
}
