import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import {
  ActiveSubscribersByTierResponse,
  AiChatVolumeResponse,
  AnalyticsFilters,
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
import { ForbiddenError } from '@lily/shared/errors/admin'

export const AdminAnalyticsApi = HttpApiGroup.make('admin-analytics')
  .add(
    HttpApiEndpoint.get('usersByStatus')`/users-by-status`
      .addSuccess(UsersByStatusResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('activeSubscribersByTier')`/active-subscribers-by-tier`
      .addSuccess(ActiveSubscribersByTierResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get(
      'plantsPerUserDistribution'
    )`/plants-per-user-distribution`
      .addSuccess(PlantsPerUserDistributionResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('careLogVolumeByType')`/care-log-volume-by-type`
      .setUrlParams(AnalyticsFilters)
      .addSuccess(CareLogVolumeByTypeResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('deadLetterVolume')`/dead-letter-volume`
      .setUrlParams(AnalyticsFilters)
      .addSuccess(DeadLetterVolumeResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('aiChatVolume')`/ai-chat-volume`
      .setUrlParams(AnalyticsFilters)
      .addSuccess(AiChatVolumeResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('diagnosisResolutionRate')`/diagnosis-resolution-rate`
      .addSuccess(DiagnosisResolutionRateResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('paywallAttribution')`/paywall-attribution`
      .addSuccess(PaywallAttributionResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('signupToFirstPlant')`/signup-to-first-plant`
      .addSuccess(SignupToFirstPlantResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('trialToPaid')`/trial-to-paid`
      .addSuccess(TrialToPaidResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get(
      'notificationToCareAction'
    )`/notification-to-care-action`
      .setUrlParams(AnalyticsFilters)
      .addSuccess(NotificationToCareActionResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('mrrEstimate')`/mrr-estimate`
      .addSuccess(MrrEstimateResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('dauWauMau')`/dau-wau-mau`
      .addSuccess(DauWauMauResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .add(
    HttpApiEndpoint.get('paidChurn')`/paid-churn`
      .addSuccess(PaidChurnResponse)
      .addError(ForbiddenError, { status: 403 })
  )
  .prefix('/admin/analytics')
  .middleware(AdminAuth)
