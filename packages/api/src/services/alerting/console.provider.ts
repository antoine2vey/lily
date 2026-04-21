import {
  type AlertEvent,
  Alerter,
  AlerterConfig,
  type AlertMeta,
  type AlertTransport,
  makeAlerter,
} from '@lily/api/services/alerting/service'
import { Effect, Layer, Match } from 'effect'

const levelFor = (event: AlertEvent): 'Error' | 'Warning' =>
  Match.value(event).pipe(
    Match.tag('HttpError5xx', () => 'Error' as const),
    Match.tag('UnhandledDefect', () => 'Error' as const),
    Match.tag('ProviderError', () => 'Error' as const),
    Match.tag('OperationalWarning', () => 'Warning' as const),
    Match.exhaustive
  )

const payloadFor = (event: AlertEvent, meta: AlertMeta) => ({
  tag: event._tag,
  environment: meta.environment,
  duplicateCount: meta.duplicateCount,
  ...event,
})

const emit: AlertTransport = (event, meta) => {
  const log = levelFor(event) === 'Error' ? Effect.logError : Effect.logWarning
  return log('[alerter] alert emitted', payloadFor(event, meta))
}

export const ConsoleAlerterLive = Layer.effect(
  Alerter,
  Effect.gen(function* () {
    const settings = yield* AlerterConfig
    yield* Effect.log('Console alerter initialized', {
      environment: settings.environment,
    })
    return yield* makeAlerter(emit, settings)
  })
)
