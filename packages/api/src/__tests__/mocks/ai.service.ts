import { AiService } from '@lily/api/services/ai/service'
import type { StepData } from '@lily/api/services/ai-chat/plant-chat'
import type { UIMessage } from 'ai'
import { Deferred, Effect, Layer, Option, pipe } from 'effect'

export interface MockAiServiceData {
  plantChatResponse?: string
  mockSteps?: readonly StepData[]
}

// Create an async generator to simulate the text stream
async function* createTextStream(text: string): AsyncIterable<string> {
  yield text
}

// Create a mock UI message stream (async iterable of chunks)
async function* createMockUIMessageStream(text: string) {
  yield { type: 'text-start' as const, id: 'mock-msg' }
  yield { type: 'text-delta' as const, delta: text, id: 'mock-msg' }
  yield { type: 'text-end' as const, id: 'mock-msg' }
}

export const createMockAiService = (
  data: MockAiServiceData = {}
): Layer.Layer<AiService> => {
  const response = pipe(
    Option.fromNullable(data.plantChatResponse),
    Option.getOrElse(() => 'Mock AI response')
  )

  const steps: readonly StepData[] = pipe(
    Option.fromNullable(data.mockSteps),
    Option.getOrElse((): readonly StepData[] => [
      { text: response, toolResults: [] },
    ])
  )

  const mockService = {
    plantRecognition: (_url: string, _locale?: string) =>
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
        wateringTips: 'Water when top soil is dry.',
      }),
    plantRecognitionWithRetry: (
      _urls: string | readonly string[],
      _locale?: string,
      _maxAttempts?: number
    ) =>
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
        wateringTips: 'Water when top soil is dry.',
      }),
    plantChatStream: (
      _plantId: string,
      _messages: UIMessage[],
      _options?: { imageUrl?: string }
    ) =>
      Effect.gen(function* () {
        const completionDeferred = yield* Deferred.make<readonly StepData[]>()

        // Immediately resolve the deferred with mock steps
        yield* Deferred.succeed(completionDeferred, steps)

        return {
          stream: {
            textStream: createTextStream(response),
            text: Promise.resolve(response),
            toolResults: Promise.resolve([]),
            toUIMessageStream: () => createMockUIMessageStream(response),
            response: Promise.resolve({
              messages: [
                {
                  role: 'assistant' as const,
                  content: [{ type: 'text' as const, text: response }],
                },
              ],
            }),
          },
          completionDeferred,
        }
      }),
    plantCardScan: (_url: string, _locale?: string) =>
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
        wateringTips: 'Water when top soil is dry.',
      }),
    plantCardScanMultiple: (_urls: string[], _locale?: string) =>
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
        wateringTips: 'Water when top soil is dry.',
      }),
  }

  return Layer.succeed(
    AiService,
    mockService as unknown as typeof AiService.Service
  )
}
