import { Data, Effect, Option, pipe, Schema } from 'effect'
import { requireOptionalNativeModule } from 'expo'
import { Platform } from 'react-native'

export const WidgetWriteOutcome = Schema.Literals([
  'written',
  'unchanged',
  'unavailable',
])
export type WidgetWriteOutcome = typeof WidgetWriteOutcome.Type

export class WidgetWriteError extends Data.TaggedError('WidgetWriteError')<{
  readonly cause: unknown
}> {}

interface RawWidgetModule {
  writeTodaySnapshot(json: string): Promise<string>
}

const native: Option.Option<RawWidgetModule> = pipe(
  Option.liftPredicate(Platform.OS, (os) => os === 'ios'),
  Option.flatMap(() =>
    Option.fromNullishOr(
      requireOptionalNativeModule<RawWidgetModule>('ExpoLilyWidgetModule')
    )
  )
)

const decodeOutcome = Schema.decodeUnknownEffect(WidgetWriteOutcome)

export const writeTodayWidgetSnapshot = (
  json: string
): Effect.Effect<WidgetWriteOutcome, WidgetWriteError> =>
  Option.match(native, {
    onNone: () => Effect.succeed<WidgetWriteOutcome>('unavailable'),
    onSome: (module) =>
      pipe(
        Effect.tryPromise({
          try: () => module.writeTodaySnapshot(json),
          catch: (cause) => new WidgetWriteError({ cause }),
        }),
        Effect.flatMap((raw) =>
          pipe(
            decodeOutcome(raw),
            Effect.mapError((cause) => new WidgetWriteError({ cause }))
          )
        )
      ),
  })
