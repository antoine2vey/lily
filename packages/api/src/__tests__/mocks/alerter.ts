import { Alerter, type IAlerter } from '@lily/api/services/alerting'
import { Effect, Layer } from 'effect'

export type CapturedAlert =
  | Parameters<IAlerter['alert']>[0]
  | { _tag: 'warning'; source: string; summary: string; context: unknown }

export const createMockAlerter = () => {
  const events: CapturedAlert[] = []
  const service: IAlerter = {
    alert: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
    alertWarning: (source, summary, context) =>
      Effect.sync(() => {
        events.push({
          _tag: 'warning',
          source,
          summary,
          context: context ?? {},
        })
      }),
  }
  return {
    layer: Layer.succeed(Alerter, service),
    events,
  }
}

/**
 * Zero-op alerter layer for tests that don't care about alerting signal.
 */
export const MockAlerterLive = Layer.succeed(Alerter, {
  alert: () => Effect.void,
  alertWarning: () => Effect.void,
} satisfies IAlerter)
