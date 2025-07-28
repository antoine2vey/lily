import type { PrismaError, PrismaService } from '@lily/db'
import type { ScanCardResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

// Placeholder methods for unimplemented functionality
export const scanCard = (): Effect.Effect<
  ScanCardResponse,
  PrismaError,
  PrismaService
> =>
  Effect.succeed({
    name: 'Placeholder Plant',
    description: 'Scanned from nursery card',
    category: 'Unknown',
    wateringFrequencyDays: 7,
    sunlightPreference: 'Medium',
    humidityRating: 5,
    petToxicityRating: 1,
  })
