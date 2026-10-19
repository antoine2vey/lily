import { Duration, Effect } from 'effect'

import { mapOpenAIError, OpenAIError } from '../../domains/ai-chat/errors'

// Per-call deadlines for the vision calls in this folder. Over the 60 days to
// 2026-10-19, `AiService.classifyAndIdentify` (one detect call plus up to
// three recognition retries) took p50 3.9 s and at most 15.9 s, so one call
// gets 30 s. Titles are a few tokens of text: one observed run took 0.7 s.
export const OPENAI_TIMEOUTS = {
  vision: Duration.seconds(30),
  conversationTitle: Duration.seconds(15),
} as const

/**
 * Runs one AI SDK call under a deadline. `call` receives the fiber's
 * interruption signal, so passing it as `abortSignal` cancels the HTTP
 * request when the deadline fires instead of leaving it running.
 */
export const callOpenAI = <A>(
  context: string,
  timeout: Duration.Duration,
  call: (abortSignal: AbortSignal) => PromiseLike<A>
): Effect.Effect<A, OpenAIError> =>
  Effect.tryPromise({ try: call, catch: mapOpenAIError(context) }).pipe(
    Effect.timeoutOrElse({
      duration: timeout,
      // A hang reuses `server_error` rather than a new code: OpenAIError is
      // in the API's error schema, and installed app builds can't decode
      // codes they don't know.
      orElse: () =>
        Effect.fail(
          new OpenAIError({
            code: 'server_error',
            message: `${context}: no response within ${Duration.format(timeout)}`,
          })
        ),
    })
  )
