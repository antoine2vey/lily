import { CareType } from '@lily/shared'
import { DateTime, type Duration, Option, pipe, Schema } from 'effect'

export const FollowUpBasis = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('none') }),
  Schema.Struct({ kind: Schema.Literal('late'), careType: CareType }),
  Schema.Struct({
    kind: Schema.Literal('health'),
    status: Schema.Literals(['SICK', 'RECOVERING']),
  }),
  Schema.Struct({
    kind: Schema.Literal('diagnosis'),
    diagnosisId: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('carePlan') }),
])
export type FollowUpBasis = typeof FollowUpBasis.Type

export const FollowUp = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  basis: FollowUpBasis,
})
export type FollowUp = typeof FollowUp.Type

export interface FollowUpSet {
  readonly userId: string
  readonly plantId: string
  readonly language: string
  readonly requestedAt: Date | null
  readonly claimedUntil: Date | null
  readonly generatedAt: Date | null
  readonly followUps: ReadonlyArray<FollowUp>
}

export type FollowUpLifecycle = 'idle' | 'requested' | 'claimed'

export const lifecycleOf = (
  set: Pick<FollowUpSet, 'requestedAt' | 'claimedUntil'>,
  now: DateTime.Utc
): FollowUpLifecycle =>
  Option.match(Option.fromNullishOr(set.requestedAt), {
    onNone: () => 'idle',
    onSome: () =>
      pipe(
        Option.fromNullishOr(set.claimedUntil),
        Option.exists((until) =>
          DateTime.isGreaterThanOrEqualTo(DateTime.fromDateUnsafe(until), now)
        )
      )
        ? 'claimed'
        : 'requested',
  })

export const ageOf = (
  set: Pick<FollowUpSet, 'generatedAt'>,
  now: DateTime.Utc
): Option.Option<Duration.Duration> =>
  Option.map(Option.fromNullishOr(set.generatedAt), (generatedAt) =>
    DateTime.distance(DateTime.fromDateUnsafe(generatedAt), now)
  )
