import { AiApiCallError, AiGenericError } from '@lily/shared'
import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/shared/services/ai/plant-card-scan'
import { plantRecognition } from '@lily/shared/services/ai/plant-recognition'
import { AISDKError, type UIMessage } from 'ai'
import { Effect } from 'effect'

import { type PlantChatImageOptions, plantChat } from '../ai-chat/plant-chat'

export { AiApiCallError, AiGenericError }

function mapAiSdkError(error: unknown): AiApiCallError | AiGenericError {
  if (AISDKError.isInstance(error) && error.name === 'AI_APICallError') {
    return new AiApiCallError({ message: 'OpenAI API call error' })
  }
  return new AiGenericError({ message: 'Unknown error' })
}

export class AiService extends Effect.Service<AiService>()('AiService', {
  effect: Effect.gen(function* () {
    return {
      plantRecognition: (urls: string | readonly string[], locale = 'en') =>
        plantRecognition(urls, locale).pipe(
          Effect.mapError(mapAiSdkError),
          Effect.withSpan('AiService.plantRecognition')
        ),
      // Returns raw AI SDK StreamTextResult for streaming endpoint
      plantChatStream: (
        plantId: string,
        messages: UIMessage[],
        imageOptions?: PlantChatImageOptions
      ) =>
        plantChat(plantId, messages, imageOptions).pipe(
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
