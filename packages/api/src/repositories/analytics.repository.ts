import { funnelMetrics } from '@lily/api/repositories/analytics/funnels'
import { liveMetrics } from '@lily/api/repositories/analytics/live-metrics'
import {
  type SnapshotValue,
  snapshotMetrics,
} from '@lily/api/repositories/analytics/snapshots'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { parseApiDate } from '@lily/shared'
import type {
  ActiveSubscribersByTierResponse,
  AiChatVolumeResponse,
  AnalyticsMetricKey,
  CareLogVolumeByTypeResponse,
  DauWauMauResponse,
  DeadLetterVolumeResponse,
  DiagnosisResolutionRateResponse,
  MrrEstimateResponse,
  NotificationToCareActionResponse,
  PaidChurnResponse,
  PaywallAttributionResponse,
  PlantsPerUserDistributionResponse,
  SignupToFirstPlantResponse,
  TrialToPaidResponse,
  UsersByStatusResponse,
} from '@lily/shared/admin/analytics'
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface AnalyticsRange {
  readonly from: Date
  readonly to: Date
}

export const resolveRange = (
  from: string | undefined,
  to: string | undefined
): AnalyticsRange => {
  const current = DateTime.nowUnsafe()
  const defaultFrom = DateTime.subtractDuration(current, Duration.days(30))
  return {
    from: DateTime.toDate(
      pipe(
        parseApiDate(from),
        Option.getOrElse(() => defaultFrom)
      )
    ),
    to: DateTime.toDate(
      pipe(
        parseApiDate(to),
        Option.getOrElse(() => current)
      )
    ),
  }
}

export interface IAnalyticsRepository {
  readonly usersByStatus: Effect.Effect<UsersByStatusResponse, SqlError>
  readonly activeSubscribersByTier: Effect.Effect<
    ActiveSubscribersByTierResponse,
    SqlError
  >
  readonly plantsPerUserDistribution: Effect.Effect<
    PlantsPerUserDistributionResponse,
    SqlError
  >
  readonly careLogVolumeByType: (
    range: AnalyticsRange
  ) => Effect.Effect<CareLogVolumeByTypeResponse, SqlError>
  readonly deadLetterVolume: (
    range: AnalyticsRange
  ) => Effect.Effect<DeadLetterVolumeResponse, SqlError>
  readonly aiChatVolume: (
    range: AnalyticsRange
  ) => Effect.Effect<AiChatVolumeResponse, SqlError>
  readonly diagnosisResolutionRate: Effect.Effect<
    DiagnosisResolutionRateResponse,
    SqlError
  >
  readonly paywallAttribution: Effect.Effect<
    PaywallAttributionResponse,
    SqlError
  >
  readonly signupToFirstPlant: Effect.Effect<
    SignupToFirstPlantResponse,
    SqlError
  >
  readonly trialToPaid: Effect.Effect<TrialToPaidResponse, SqlError>
  readonly notificationToCareAction: (
    range: AnalyticsRange
  ) => Effect.Effect<NotificationToCareActionResponse, SqlError>
  readonly writeSnapshot: <K extends AnalyticsMetricKey>(
    date: string,
    metricKey: K,
    value: SnapshotValue<K>
  ) => Effect.Effect<void, SqlError>
  readonly computeMrrSnapshot: Effect.Effect<
    SnapshotValue<'mrr_estimate'>,
    SqlError
  >
  readonly computeDauWauMauSnapshot: Effect.Effect<
    SnapshotValue<'dau_wau_mau'>,
    SqlError
  >
  readonly computePaidChurnSnapshot: Effect.Effect<
    SnapshotValue<'paid_churn_monthly'>,
    SqlError
  >
  readonly getMrrEstimate: Effect.Effect<MrrEstimateResponse, SqlError>
  readonly getDauWauMau: Effect.Effect<DauWauMauResponse, SqlError>
  readonly getPaidChurn: Effect.Effect<PaidChurnResponse, SqlError>
}

export class AnalyticsRepository extends Context.Service<
  AnalyticsRepository,
  IAnalyticsRepository
>()('AnalyticsRepository') {}

export const AnalyticsRepositoryLive = Layer.effect(
  AnalyticsRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return {
      ...liveMetrics(db),
      ...funnelMetrics(db),
      ...snapshotMetrics(db),
    }
  })
)
