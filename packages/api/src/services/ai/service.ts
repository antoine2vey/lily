import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
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
    }
  }),
}) {}
