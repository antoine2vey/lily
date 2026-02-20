import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/shared/services/ai/plant-card-scan'
import {
  plantRecognition,
  plantRecognitionWithRetry,
} from '@lily/shared/services/ai/plant-recognition'
import { AISDKError, type UIMessage } from 'ai'
import { Effect, Schema } from 'effect'

import { type PlantChatOptions, plantChat } from '../ai-chat/plant-chat'

export class AiApiCallError extends Schema.Class<AiApiCallError>(
  'AiApiCallError'
)({
  message: Schema.String,
}) {}

export class AiGenericError extends Schema.Class<AiGenericError>(
  'AiGenericError'
)({ message: Schema.String }) {}

function mapAiSdkError(error: unknown): AiApiCallError | AiGenericError {
  if (AISDKError.isInstance(error) && error.name === 'AI_APICallError') {
    return new AiApiCallError({ message: 'OpenAI API call error' })
  }
  return new AiGenericError({ message: 'Unknown error' })
}

export class AiService extends Effect.Service<AiService>()('AiService', {
  effect: Effect.gen(function* () {
    return {
      plantRecognition: (url: string, locale = 'en') =>
        plantRecognition(url, locale).pipe(
          Effect.mapError(mapAiSdkError),
          Effect.withSpan('AiService.plantRecognition')
        ),
      plantRecognitionWithRetry: (
        urls: string | readonly string[],
        locale = 'en',
        maxAttempts = 3
      ) =>
        plantRecognitionWithRetry(urls, locale, maxAttempts).pipe(
          Effect.mapError(mapAiSdkError),
          Effect.withSpan('AiService.plantRecognitionWithRetry')
        ),
      // Returns raw AI SDK StreamTextResult for streaming endpoint
      plantChatStream: (
        plantId: string,
        messages: UIMessage[],
        options?: PlantChatOptions
      ) =>
        plantChat(plantId, messages, options).pipe(
          Effect.withSpan('AiService.plantChatStream', {
            attributes: { 'plant.id': plantId },
          })
        ),
      plantCardScan: (url: string, locale = 'en') =>
        plantCardScan(url, locale).pipe(
          Effect.mapError(mapAiSdkError),
          Effect.withSpan('AiService.plantCardScan')
        ),
      plantCardScanMultiple: (urls: readonly string[], locale = 'en') =>
        plantCardScanMultiple(urls as string[], locale).pipe(
          Effect.mapError(mapAiSdkError),
          Effect.withSpan('AiService.plantCardScanMultiple', {
            attributes: { 'scan.imageCount': urls.length },
          })
        ),
    }
  }),
}) {}
