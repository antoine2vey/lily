import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { Effect } from 'effect'

import { mapOpenAIError, type OpenAIError } from '../../domains/ai-chat/errors'
import { detectSchema, type PlantDetectResult } from './plant-schema'
import {
  careInstructions,
  nullCareResponse,
  safetyInstructions,
} from './prompts'
import { withQualityRetry } from './quality-check'

const systemPrompt = (locale: string) => `
You are a plant identification assistant.
IMPORTANT: Write all text fields (description, wateringTips) in the language corresponding to locale "${locale}".

First, classify the image:
- "plant" if it shows a live/real plant (potted, garden, etc.)
- "card" if it shows a nursery card, plant tag, plant label, or care instruction card
- "unknown" if the image is unclear or doesn't fit either category

Set the detectedType field to your classification.

Then identify the plant based on your classification:

If detectedType is "plant":
- Analyze the visual characteristics of the plant (leaves, stems, flowers, growth pattern).
- Identify the most likely plant. Always return the well-known common name (e.g. "Snake Plant", "Pothos", "Peace Lily"), not the scientific/Latin name. Only use the scientific name if no common name exists.
- Use the common name appropriate for the user's locale.
- Identify the family of the plant.
- Return a confidence score between 0 and 1.
- Provide up to 3 alternative plant suggestions, each with its common name and confidence score.

If detectedType is "card":
- Extract the plant name from the card text. If the card shows a scientific/Latin name, translate it to the well-known common name (e.g. "Sansevieria" → "Snake Plant").
- Use the common name appropriate for the user's locale.
- Identify the plant family if mentioned or inferable.
- Return a confidence score between 0 and 1.
- Provide up to 3 alternative plant suggestions if unsure.

If detectedType is "unknown":
- Attempt identification from whatever is visible.

${careInstructions}

If you are not confident about a care field, set it to null.

If you are confident the image does not contain a plant or plant-related content, respond with:
${nullCareResponse}
detectedType: "unknown"

${safetyInstructions}
Include confidence scores for all results including the alternatives.
`

const singleCall = (
  url: string,
  locale: string
): Effect.Effect<PlantDetectResult, OpenAIError> =>
  Effect.tryPromise({
    try: async () => {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        output: Output.object({ schema: detectSchema }),
        system: systemPrompt(locale),
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: url }],
          },
        ],
      })
      return result.output as PlantDetectResult
    },
    catch: mapOpenAIError('Plant detection'),
  })

export const plantDetect = (
  url: string,
  locale = 'en'
): Effect.Effect<PlantDetectResult, OpenAIError> =>
  withQualityRetry(singleCall(url, locale))
