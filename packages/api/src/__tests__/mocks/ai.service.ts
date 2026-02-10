import { AiService } from '@lily/api/services/ai/service'
import type { UIMessage } from 'ai'
import { Effect, Layer, Option, pipe, Stream } from 'effect'

export interface MockAiServiceData {
  plantChatResponse?: string
}

// Create an async generator to simulate the text stream
async function* createTextStream(text: string): AsyncIterable<string> {
  yield text
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
      Effect.succeed({
        name: 'Mock Plant',
        family: 'Mockaceae',
        confidence: 0.95,
        alternatives: [],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 50,
        petToxicityRating: 20,
        fertilizationFrequencyDays: 30,
        category: 'Tropical',
        description: 'A mock plant for testing',
      }),
    plantChat: (_plantId: string, _messages: UIMessage[]) =>
      Effect.succeed(Stream.make(responseBytes)),
    // Returns a mock StreamTextResult-like object for streaming endpoint
    plantChatStream: (_plantId: string, _messages: UIMessage[]) =>
      Effect.succeed({
        textStream: createTextStream(response),
        text: Promise.resolve(response),
      }),
    plantCardScan: (_url: string) =>
      Effect.succeed({
        name: 'Mock Plant',
        family: 'Mockaceae',
        confidence: 0.85,
        alternatives: [],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 50,
        petToxicityRating: 20,
        fertilizationFrequencyDays: 30,
        category: 'Tropical',
        description: 'A mock plant description',
      }),
    plantCardScanMultiple: (_urls: string[]) =>
      Effect.succeed({
        name: 'Mock Plant',
        family: 'Mockaceae',
        confidence: 0.92,
        alternatives: [],
        wateringFrequencyDays: 7,
        luxNeeded: 2000,
        humidityRating: 50,
        petToxicityRating: 20,
        fertilizationFrequencyDays: 30,
        category: 'Tropical',
        description: 'A mock plant identified from multiple images',
      }),
  }

  return Layer.succeed(
    AiService,
    mockService as unknown as typeof AiService.Service
  )
}
