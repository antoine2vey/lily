import type { PrismaError, PrismaService } from '@lily/db'
import type { AIIdentifyResponse } from '@lily/shared/plant'
import { Effect } from 'effect'

export const aiIdentify = (): Effect.Effect<
  AIIdentifyResponse,
  PrismaError,
  PrismaService
> =>
  Effect.succeed({
    species: 'Unknown Species',
    commonName: 'Unknown Plant',
    category: 'Unknown',
    wateringFrequencyDays: 7,
    sunlightPreference: 'Medium',
    humidityRating: 5,
    lightingRating: 5,
    petToxicityRating: 1,
    confidence: 0.75,
  })
