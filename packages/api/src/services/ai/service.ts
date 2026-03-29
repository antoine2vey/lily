import {
  plantCardScan,
  plantCardScanMultiple,
} from '@lily/shared/services/ai/plant-card-scan'
import { plantDetect } from '@lily/shared/services/ai/plant-detect'
import { plantRecognition } from '@lily/shared/services/ai/plant-recognition'
import type { UIMessage } from 'ai'
import { Effect } from 'effect'

import { type PlantChatImageOptions, plantChat } from '../ai-chat/plant-chat'

export class AiService extends Effect.Service<AiService>()('AiService', {
  effect: Effect.gen(function* () {
    return {
      plantRecognition: (urls: string | readonly string[], locale = 'en') =>
        plantRecognition(urls, locale).pipe(
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
          Effect.withSpan('AiService.plantCardScan')
        ),
      plantCardScanMultiple: (urls: readonly string[], locale = 'en') =>
        plantCardScanMultiple(urls as string[], locale).pipe(
          Effect.withSpan('AiService.plantCardScanMultiple', {
            attributes: { 'scan.imageCount': urls.length },
          })
        ),
      classifyAndIdentify: (url: string, locale = 'en') =>
        plantDetect(url, locale).pipe(
          Effect.withSpan('AiService.classifyAndIdentify')
        ),
    }
  }),
}) {}
