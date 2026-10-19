import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { type Effect, String as Str } from 'effect'

import type { OpenAIError } from '../../domains/ai-chat/errors'
import { callOpenAI, OPENAI_TIMEOUTS } from './call-openai'

const systemPrompt = `You generate ultra-short titles for chat conversations between a user and a plant-care assistant.

Rules:
- 2 to 5 words.
- Title Case.
- No quotes, no trailing punctuation, no emojis.
- Capture the topic, not the question form. Prefer "Yellow Monstera Leaves" over "Why Are My Leaves Yellow".
- If the topic is unclear, return "Plant Care Chat".`

export interface GenerateConversationTitleInput {
  readonly userMessage: string
  readonly assistantReply: string
}

export const generateConversationTitle = (
  input: GenerateConversationTitleInput
): Effect.Effect<string, OpenAIError> =>
  callOpenAI(
    'Conversation title generation',
    OPENAI_TIMEOUTS.conversationTitle,
    async (abortSignal) => {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        maxRetries: 0,
        abortSignal,
        system: systemPrompt,
        prompt: `User: ${input.userMessage}\n\nAssistant: ${input.assistantReply.slice(0, 400)}\n\nTitle:`,
      })
      return Str.trim(result.text).replace(/^["'`]+|["'`.!?]+$/g, '')
    }
  )
