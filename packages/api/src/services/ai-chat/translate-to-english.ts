import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { Effect } from 'effect'

export const translateToEnglish = (text: string): Effect.Effect<string> =>
  Effect.promise(() =>
    generateText({
      model: openai('gpt-4o-mini'),
      output: Output.text(),
      system:
        'Translate the following message to English. If already in English, return it unchanged. Output only the translated text, nothing else.',
      prompt: text,
    }).then((r) => r.output)
  )
