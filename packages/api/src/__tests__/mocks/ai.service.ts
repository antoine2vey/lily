import { AiService } from '@lily/api/services/ai/service'
import type { UIMessage } from 'ai'
import { Effect, Layer, Option, pipe, Stream } from 'effect'

export interface MockAiServiceData {
  plantChatResponse?: string
}

export const createMockAiService = (
  data: MockAiServiceData = {}
): Layer.Layer<AiService> => {
  const response = pipe(
    Option.fromNullable(data.plantChatResponse),
    Option.getOrElse(() => 'Mock AI response')
  )
  const responseBytes = new TextEncoder().encode(response)

  const mockService = {
    plantRecognition: (_url: string) =>
      Effect.succeed(Stream.make(new TextEncoder().encode('Mock recognition'))),
    plantChat: (_plantId: string, _messages: UIMessage[]) =>
      Effect.succeed(Stream.make(responseBytes)),
    plantCardScan: (_url: string) =>
      Effect.succeed({
        name: 'Mock Plant',
        description: 'A mock plant description',
        humidityRating: null,
        lightingRating: null,
        petToxicityRating: null,
        wateringRating: null,
        wateringFrequencyDays: null,
        fertilizationFrequencyDays: null,
        category: null,
      }),
  }

  return Layer.succeed(
    AiService,
    mockService as unknown as typeof AiService.Service
  )
}
