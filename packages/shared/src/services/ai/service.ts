import { plantCardScan } from '@lily/shared/services/ai/plant-card-scan'
import { plantChat } from '@lily/shared/services/ai/plant-chat'
import { plantRecognition } from '@lily/shared/services/ai/plant-recognition'
import { AISDKError, type AsyncIterableStream, type UIMessage } from 'ai'
import { Effect, Schema, Stream } from 'effect'

const streamSdk = (textStream: AsyncIterableStream<string>) =>
  Stream.fromAsyncIterable(
    textStream,
    () => new Error('AI text stream closed unexpectedly')
  ).pipe(Stream.map((text) => new TextEncoder().encode(text)))

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
        Effect.gen(function* () {
          const stream = yield* plantRecognition(url)

          return streamSdk(stream.textStream)
        }),
      plantChat: (plantId: string, messages: UIMessage[]) =>
        Effect.gen(function* () {
          const stream = yield* plantChat(plantId, messages)

          return streamSdk(stream.textStream)
        }),
      plantCardScan: (url: string) =>
        Effect.gen(function* () {
          const scanCard = yield* plantCardScan(url)
          const { object } = yield* Effect.tryPromise({
            try: () => scanCard,
            catch: (error: unknown) => {
              if (AISDKError.isInstance(error)) {
                if (error.name === 'AI_APICallError') {
                  return new AiApiCallError({
                    message: 'OpenAI API call error',
                  })
                }
              }

              return new AiGenericError({
                message: 'Unknown error',
              })
            },
          })

          return object
        }),
    }
  }),
}) {}
