import type { AsyncIterableStream } from 'ai'
import { Stream } from 'effect'

import { OpenAIError } from '../../domains/ai-chat/errors'

/**
 * Converts an AI SDK AsyncIterableStream to an Effect Stream of encoded bytes.
 * Used for streaming AI responses via HTTP.
 */
export const streamSdk = (textStream: AsyncIterableStream<string>) =>
  Stream.fromAsyncIterable(
    textStream,
    () =>
      new OpenAIError({
        code: 'unknown',
        message: 'AI text stream closed unexpectedly',
      })
  ).pipe(Stream.map((text) => new TextEncoder().encode(text)))
