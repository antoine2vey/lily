import type { ScanCardResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

// Placeholder methods for unimplemented functionality
export const scanCard = () =>
  Effect.succeed({
    name: 'Placeholder Plant',
    description: 'Scanned from nursery card',
    category: 'Unknown',
    wateringFrequencyDays: 7,
    sunlightPreference: 'Medium',
    humidityRating: 5,
    petToxicityRating: 1,
  } satisfies ScanCardResponse)
