import { AiService } from '@lily/api/services/ai/service'
import {
  ChatStreamError,
  type StepData,
} from '@lily/api/services/ai-chat/plant-chat'
import type { ChatConversation } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import {
  Deferred,
  type Duration,
  Effect,
  Exit,
  Layer,
  Option,
  pipe,
} from 'effect'

export interface MockAiServiceData {
  plantChatResponse?: string
  mockSteps?: readonly StepData[]
  chatStreamError?: string
  uiChunks?: readonly Record<string, unknown>[]
  completesAfter?: Duration.Input
  chatStreamCalls?: ChatStreamCall[]
}

export interface ChatStreamCall {
  messages: UIMessage[]
  imageOptions?: { imageUrl?: string; imageKey?: string } | undefined
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

async function* createChunkStream(chunks: readonly Record<string, unknown>[]) {
  yield* chunks
}

async function* createMockErrorStream(errorText: string) {
  yield { type: 'error' as const, errorText }
}

export const createMockAiService = (
  data: MockAiServiceData = {}
): Layer.Layer<AiService> => {
  const response = pipe(
    Option.fromNullishOr(data.plantChatResponse),
    Option.getOrElse(() => 'Mock AI response')
  )

  const steps: readonly StepData[] = pipe(
    Option.fromNullishOr(data.mockSteps),
    Option.getOrElse((): readonly StepData[] => [
      { text: response, toolResults: [] },
    ])
  )

  const mockService = {
    plantRecognition: (_urls: string | readonly string[], _locale?: string) =>
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
    chatStream: (
      _conversation: ChatConversation,
      messages: UIMessage[],
      imageOptions?: { imageUrl?: string; imageKey?: string }
    ) =>
      Effect.gen(function* () {
        data.chatStreamCalls?.push({ messages, imageOptions })
        const completionDeferred = yield* Deferred.make<
          readonly StepData[],
          ChatStreamError
        >()

        const failure = Option.fromNullishOr(data.chatStreamError)

        const complete = Deferred.done(
          completionDeferred,
          pipe(
            failure,
            Option.match({
              onNone: () => Exit.succeed(steps),
              onSome: (message) =>
                Exit.fail(new ChatStreamError({ message, cause: message })),
            })
          )
        )

        yield* pipe(
          Option.fromNullishOr(data.completesAfter),
          Option.match({
            onNone: () => complete,
            onSome: (delay) =>
              Effect.forkDetach(
                Effect.sleep(delay).pipe(Effect.andThen(complete))
              ),
          })
        )

        return {
          stream: {
            textStream: createTextStream(response),
            text: Promise.resolve(response),
            toolResults: Promise.resolve([]),
            consumeStream: () => Promise.resolve(),
            toUIMessageStream: () =>
              pipe(
                failure,
                Option.match({
                  onNone: () =>
                    pipe(
                      Option.fromNullishOr(data.uiChunks),
                      Option.match({
                        onNone: () => createMockUIMessageStream(response),
                        onSome: createChunkStream,
                      })
                    ),
                  onSome: createMockErrorStream,
                })
              ),
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
    generateConversationTitle: (_input: {
      userMessage: string
      assistantReply: string
    }) => Effect.succeed('Mock Conversation Title'),
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
