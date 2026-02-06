import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/shared/services/ai/plant-card-scan'
import { plantRecognition } from '@lily/shared/services/ai/plant-recognition'
import { streamSdk } from '@lily/shared/services/ai/stream'
import { AISDKError, type UIMessage } from 'ai'
import { Effect, Schema } from 'effect'

import { plantChat } from '../ai-chat/plant-chat'

export { streamSdk }

export class AiApiCallError extends Schema.Class<AiApiCallError>(
  'AiApiCallError'
)({
  message: Schema.String,
}) {}

export class AiGenericError extends Schema.Class<AiGenericError>(
  'AiGenericError'
)({ message: Schema.String }) {}

export class AiService extends Effect.Service<AiService>()('AiService', {
  effect: Effect.gen(function* () {
    return {
      plantRecognition: (url: string) =>
        plantRecognition(url).pipe(
          Effect.mapError((error) => {
            if (AISDKError.isInstance(error)) {
              if (error.name === 'AI_APICallError') {
                return new AiApiCallError({
                  message: 'OpenAI API call error',
                })
              }
            }
            return new AiGenericError({ message: 'Unknown error' })
          }),
          Effect.withSpan('AiService.plantRecognition')
        ),
      // Returns raw AI SDK StreamTextResult for streaming endpoint
      plantChatStream: (plantId: string, messages: UIMessage[]) =>
        plantChat(plantId, messages).pipe(
          Effect.withSpan('AiService.plantChatStream', {
            attributes: { 'plant.id': plantId },
          })
        ),
      // Returns Effect Stream for non-streaming endpoint (backwards compatibility)
      plantChat: (plantId: string, messages: UIMessage[]) =>
        Effect.gen(function* () {
          const stream = yield* plantChat(plantId, messages)

          return streamSdk(stream.textStream)
        }).pipe(
          Effect.withSpan('AiService.plantChat', {
            attributes: { 'plant.id': plantId },
          })
        ),
      plantCardScan: (url: string) =>
        plantCardScan(url).pipe(
          Effect.mapError((error) => {
            if (AISDKError.isInstance(error)) {
              if (error.name === 'AI_APICallError') {
                return new AiApiCallError({
                  message: 'OpenAI API call error',
                })
              }
            }
            return new AiGenericError({ message: 'Unknown error' })
          }),
          Effect.withSpan('AiService.plantCardScan')
        ),
      plantCardScanMultiple: (urls: readonly string[]) =>
        plantCardScanMultiple(urls as string[]).pipe(
          Effect.mapError((error) => {
            if (AISDKError.isInstance(error)) {
              if (error.name === 'AI_APICallError') {
                return new AiApiCallError({
                  message: 'OpenAI API call error',
                })
              }
            }
            return new AiGenericError({ message: 'Unknown error' })
          }),
          Effect.withSpan('AiService.plantCardScanMultiple', {
            attributes: { 'scan.imageCount': urls.length },
          })
        ),
    }
  }),
}) {}
