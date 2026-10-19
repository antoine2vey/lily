import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { ResendEmailServiceLive } from '@lily/api/services/email/resend.provider'
import { EmailSendError, EmailService } from '@lily/shared/server'
import {
  ConfigProvider,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
} from 'effect'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signals: AbortSignal[] = []

beforeEach(() => {
  signals.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return new Promise<never>(() => {})
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ResendLive = ResendEmailServiceLive.pipe(
  Layer.provide(MockAlerterLive),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        RESEND_API_KEY: 're_test',
        EMAIL_FROM_ADDRESS: 'hello@example.com',
      })
    )
  )
)

describe('Resend email service against an API that never responds', () => {
  it('fails with EmailSendError after 10 seconds and aborts the request', () =>
    Effect.gen(function* () {
      const email = yield* EmailService
      const fiber = yield* Effect.forkChild(
        email.send({ to: 'a@example.com', subject: 's', html: '<p>h</p>' })
      )

      yield* TestClock.adjust(Duration.seconds(9))
      expect(fiber.pollUnsafe()).toBeUndefined()
      expect(signals).toHaveLength(1)
      expect(signals[0]?.aborted).toBe(false)

      yield* TestClock.adjust(Duration.seconds(1))
      const exit = yield* Fiber.await(fiber)

      const error = Exit.findErrorOption(exit).pipe(Option.getOrUndefined)
      expect(error).toBeInstanceOf(EmailSendError)
      expect(signals[0]?.aborted).toBe(true)
    }).pipe(
      Effect.provide(Layer.merge(ResendLive, TestClock.layer())),
      Effect.runPromise
    ))
})
