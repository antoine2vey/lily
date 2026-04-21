import {
  type AlertEvent,
  type AlerterSettings,
  fingerprintEvent,
  makeAlerter,
} from '@lily/api/services/alerting/service'
import { Duration, Effect, Ref, TestClock, TestContext } from 'effect'
import { describe, expect, it } from 'vitest'

const settings: AlerterSettings = {
  environment: 'test',
  dedupeWindow: Duration.minutes(5),
  warningDedupeWindow: Duration.minutes(15),
}

const mkEvent = (overrides: Partial<AlertEvent> = {}): AlertEvent =>
  ({
    _tag: 'HttpError5xx',
    method: 'POST',
    url: '/api/plants',
    status: 500,
    ...overrides,
  }) as AlertEvent

type CapturedCall = {
  readonly event: AlertEvent
  readonly duplicateCount: number
}

const makeCapturingAlerter = () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<readonly CapturedCall[]>([])
    const transport = (event: AlertEvent, meta: { duplicateCount: number }) =>
      Ref.update(calls, (prev) => [
        ...prev,
        { event, duplicateCount: meta.duplicateCount },
      ])
    const alerter = yield* makeAlerter(transport, settings)
    return { alerter, calls }
  })

describe('makeAlerter (dedup)', () => {
  it('sends the first occurrence immediately', () =>
    Effect.gen(function* () {
      const { alerter, calls } = yield* makeCapturingAlerter()
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.millis(10))
      const snapshot = yield* Ref.get(calls)
      expect(snapshot).toHaveLength(1)
      expect(snapshot[0]?.duplicateCount).toBe(0)
    }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise))

  it('suppresses a second occurrence within the dedupe window', () =>
    Effect.gen(function* () {
      const { alerter, calls } = yield* makeCapturingAlerter()
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.minutes(1))
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.millis(10))
      const snapshot = yield* Ref.get(calls)
      expect(snapshot).toHaveLength(1)
    }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise))

  it('resends after the window elapses and includes suppressed count', () =>
    Effect.gen(function* () {
      const { alerter, calls } = yield* makeCapturingAlerter()
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.minutes(1))
      yield* alerter.alert(mkEvent())
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.minutes(5))
      yield* alerter.alert(mkEvent())
      yield* TestClock.adjust(Duration.millis(10))
      const snapshot = yield* Ref.get(calls)
      expect(snapshot).toHaveLength(2)
      expect(snapshot[1]?.duplicateCount).toBe(2)
    }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise))

  it('uses a separate window for OperationalWarning events', () =>
    Effect.gen(function* () {
      const { alerter, calls } = yield* makeCapturingAlerter()
      yield* alerter.alertWarning('notification-worker', 'push failed', {
        failed: 1,
      })
      // 10 minutes is past the 5min error window but under the 15min warning window
      yield* TestClock.adjust(Duration.minutes(10))
      yield* alerter.alertWarning('notification-worker', 'push failed', {
        failed: 2,
      })
      yield* TestClock.adjust(Duration.millis(10))
      const snapshot = yield* Ref.get(calls)
      expect(snapshot).toHaveLength(1)
    }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise))

  it('dedupes by fingerprint — different URLs produce separate alerts', () =>
    Effect.gen(function* () {
      const { alerter, calls } = yield* makeCapturingAlerter()
      yield* alerter.alert(mkEvent({ url: '/api/plants' }))
      yield* alerter.alert(mkEvent({ url: '/api/care-logs' }))
      yield* TestClock.adjust(Duration.millis(10))
      const snapshot = yield* Ref.get(calls)
      expect(snapshot).toHaveLength(2)
    }).pipe(Effect.provide(TestContext.TestContext), Effect.runPromise))
})

describe('fingerprintEvent', () => {
  it('strips query string from URL', () => {
    const a = fingerprintEvent(mkEvent({ url: '/api/plants?page=1' }))
    const b = fingerprintEvent(mkEvent({ url: '/api/plants?page=2' }))
    expect(a).toBe(b)
  })

  it('collapses UUID path segments to prevent per-resource fingerprint blowup', () => {
    const a = fingerprintEvent(
      mkEvent({ url: '/api/plants/11111111-2222-3333-4444-555555555555' })
    )
    const b = fingerprintEvent(
      mkEvent({
        url: '/api/plants/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/photos',
      })
    )
    const c = fingerprintEvent(
      mkEvent({ url: '/api/plants/11111111-2222-3333-4444-555555555555' })
    )
    expect(a).toBe(c)
    expect(a).not.toBe(b)
  })

  it('keeps method + status + path distinct per endpoint', () => {
    const a = fingerprintEvent(mkEvent({ method: 'POST' }))
    const b = fingerprintEvent(mkEvent({ method: 'GET' }))
    expect(a).not.toBe(b)
  })

  it('groups provider errors by provider + errorTag', () => {
    const a: AlertEvent = {
      _tag: 'ProviderError',
      provider: 'openai',
      errorTag: 'OpenAIError',
      message: 'rate limit',
    }
    const b: AlertEvent = {
      _tag: 'ProviderError',
      provider: 'openai',
      errorTag: 'OpenAIError',
      message: 'timeout',
    }
    expect(fingerprintEvent(a)).toBe(fingerprintEvent(b))
  })
})
