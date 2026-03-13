import z from 'zod'

/**
 * Shared zod schema for plant AI results.
 * Used by both plant recognition (photo identify) and nursery card scan.
 */
export const plantSchema = z.object({
  name: z
    .string()
    .describe(
      'The common name of the plant (e.g. "Snake Plant", not "Sansevieria trifasciata"). Use the well-known common name in the user locale. Fall back to scientific name only if no common name exists.'
    )
    .nullable(),
  family: z.string().describe('The family of the plant').nullable(),
  confidence: z.number().describe('The confidence of the plant').min(0).max(1),
  alternatives: z
    .array(
      z.object({
        name: z
          .string()
          .describe('The common name of the alternative plant')
          .nullable(),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('The confidence of the alternative'),
      })
    )
    .describe('The alternatives of the plant'),
  wateringFrequencyDays: z
    .number()
    .describe('How often to water in days')
    .nullable(),
  luxNeeded: z
    .number()
    .describe('Estimated lux needed by the plant')
    .nullable(),
  humidityRating: z
    .number()
    .min(0)
    .max(100)
    .describe('Humidity preference 0-100')
    .nullable(),
  petToxicityRating: z
    .number()
    .min(0)
    .max(100)
    .describe('Pet toxicity 0-100')
    .nullable(),
  fertilizationFrequencyDays: z
    .number()
    .describe('How often to fertilize in days')
    .nullable(),
  mistingFrequencyDays: z
    .number()
    .describe('How often to mist in days')
    .nullable(),
  repottingFrequencyDays: z
    .number()
    .describe('How often to repot in days')
    .nullable(),
  category: z
    .string()
    .describe('Plant category like Tropical, Succulent, etc.')
    .nullable(),
  description: z.string().describe('Brief 1-2 sentence description').nullable(),
  wateringTips: z
    .string()
    .describe(
      'Brief practical watering tips specific to this plant (e.g. "Let soil dry between waterings. Reduce in winter.")'
    )
    .nullable(),
})

export type PlantAIResult = z.infer<typeof plantSchema>
