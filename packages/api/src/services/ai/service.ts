import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import type { ChatConversation } from '@lily/shared/ai-chat'
import {
  type GenerateConversationTitleInput,
  generateConversationTitle,
} from '@lily/shared/services/ai/generate-conversation-title'
import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/shared/services/ai/plant-card-scan'
import { plantDetect } from '@lily/shared/services/ai/plant-detect'
import { plantRecognition } from '@lily/shared/services/ai/plant-recognition'
import type { UIMessage } from 'ai'
import { Effect } from 'effect'

import { chatStream, type PlantChatImageOptions } from '../ai-chat/plant-chat'

export class AiService extends Effect.Service<AiService>()('AiService', {
  effect: Effect.gen(function* () {
    const alerter = yield* Alerter
    const alertOpenAI = withProviderAlert(alerter, { provider: 'openai' })

    return {
      plantRecognition: (urls: string | readonly string[], locale = 'en') =>
        plantRecognition(urls, locale).pipe(
          alertOpenAI,
          Effect.withSpan('AiService.plantRecognition')
        ),
      // Returns raw AI SDK StreamTextResult for streaming endpoint.
      // Note: not wrapped in alertOpenAI because this Effect fails on access
      // errors (PlantNotFoundError), not OpenAI errors — the AI SDK streams
      // errors asynchronously outside the Effect channel.
      chatStream: (
        conversation: ChatConversation,
        messages: UIMessage[],
        imageOptions?: PlantChatImageOptions
      ) =>
        chatStream(conversation, messages, imageOptions).pipe(
          Effect.withSpan('AiService.chatStream', {
            attributes: {
              'conversation.id': conversation.id,
              'conversation.kind': conversation.kind,
            },
          })
        ),
      plantCardScan: (url: string, locale = 'en') =>
        plantCardScan(url, locale).pipe(
          alertOpenAI,
          Effect.withSpan('AiService.plantCardScan')
        ),
      plantCardScanMultiple: (urls: readonly string[], locale = 'en') =>
        plantCardScanMultiple(urls as string[], locale).pipe(
          alertOpenAI,
          Effect.withSpan('AiService.plantCardScanMultiple', {
            attributes: { 'scan.imageCount': urls.length },
          })
        ),
      classifyAndIdentify: (url: string, locale = 'en') =>
        plantDetect(url, locale).pipe(
          alertOpenAI,
          Effect.withSpan('AiService.classifyAndIdentify')
        ),
      generateConversationTitle: (input: GenerateConversationTitleInput) =>
        generateConversationTitle(input).pipe(
          alertOpenAI,
          Effect.withSpan('AiService.generateConversationTitle')
        ),
    }
  }),
}) {}
